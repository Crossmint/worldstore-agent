import {
  createSigner,
  getEncryptionKeyFromHex,
  logAgentDetails,
  validateEnvironment,
  getDbPath,
} from "./helpers/client";
import { Client, type XmtpEnv, type DecodedMessage } from "@xmtp/node-sdk";
import * as fs from "fs";
import { WalletSendCallsCodec } from "@xmtp/content-type-wallet-send-calls";
import { ContentTypeWalletSendCalls } from "@xmtp/content-type-wallet-send-calls";
import { ActionsCodec, ContentTypeActions, type ActionsContent } from "./lib/types/ActionsContent";
import { IntentCodec, type IntentContent } from "./lib/types/IntentContent";
import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { WAITING_MESSAGE } from "./helpers/constants";
import { logger } from "./helpers/logger";
import {
  UserProfile,
  AgentState,
  InsufficientFundsError,
  ProfileNotFoundError,
  FundingData,
} from "./lib/types";
import { USER_STORAGE_DIR } from "./helpers/constants";
import { shoppingAssistantPrompt } from "lib/prompts";
import { loadUserProfile } from "@helpers/loadUserProfile";
import { redisClient, saveUserProfile } from "services/redis";
import { getTools } from "@lib/tools";
import { orderProductTool } from "@lib/tools/order";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { USDCHandler } from "@helpers/usdc";
import z from "zod";
import { formatUnits } from "viem";

const { WALLET_KEY, ENCRYPTION_KEY, XMTP_ENV, ANTHROPIC_API_KEY } =
  validateEnvironment([
    "WALLET_KEY",
    "ENCRYPTION_KEY",
    "XMTP_ENV",
    "ANTHROPIC_API_KEY",
  ]);

class XMTPShoppingBot {
  private xmtpClient!: Client;
  private llm: ChatAnthropic;
  private agent: any;
  private currentFundingRequirement: { [inboxId: string]: FundingData } = {};
  private needsProfileMenu: { [inboxId: string]: boolean } = {};
  constructor() {
    this.llm = new ChatAnthropic({
      anthropicApiKey: ANTHROPIC_API_KEY,
      modelName: "claude-sonnet-4-20250514",
      temperature: 1,
    });
  }

  private async initializeRedis() {
    logger.info("Initializing Redis connection...");

    try {
      await redisClient.connect();
      const isConnected = await redisClient.ping();

      if (!isConnected) {
        throw new Error("Redis connection failed");
      }

      logger.success("Redis connected successfully");

    } catch (error) {
      logger.error("Redis initialization failed:", error);
      logger.warn("Falling back to filesystem storage");

      // Fallback: create directories for filesystem storage
      [USER_STORAGE_DIR].forEach((dir) => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });
    }
  }

  private async sendFundingRequest({
    // eslint-disable-next-line no-unused-vars
    sender: _sender,
    // eslint-disable-next-line no-unused-vars
    receiver: _receiver,
    fundingData,
    conversation,
  }: {
    sender: string;
    receiver: string;
    fundingData: FundingData;
    conversation: any;
  }) {
    try {
      // Send action buttons instead of immediate wallet request
      const fundingActions: ActionsContent = {
        id: `funding-${Date.now()}`,
        description: `💰 Insufficient funds\n\nYou need ${parseFloat(fundingData.required).toFixed(6)} USDC but only have ${parseFloat(fundingData.current).toFixed(6)} USDC.\nShortfall: ${formatUnits(BigInt(fundingData.shortfall), 6)} USDC\n\nWhat would you like to do?`,
        actions: [
          {
            id: "add-funds",
            label: "💸 Add Funds Now",
            style: "primary"
          },
          {
            id: "cancel-order",
            label: "❌ Cancel Order",
            style: "secondary"
          },
          {
            id: "check-balance",
            label: "💰 Check Balance",
            style: "secondary"
          }
        ]
      };

      await conversation.send(fundingActions, ContentTypeActions);
      await conversation.sync();

      logger.info("Funding action buttons sent", {
        shortfall: fundingData.shortfall,
        required: fundingData.required,
        current: fundingData.current
      });
    } catch (error) {
      logger.error("caught error in sendFundingRequest", error);
    }
  }

  private async sendActualFundingRequest({
    sender,
    receiver,
    fundingData,
    conversation,
  }: {
    sender: string;
    receiver: string;
    fundingData: FundingData;
    conversation: any;
  }) {
    const usdcHandler = new USDCHandler("base-sepolia");

    try {
      const walletCalls = usdcHandler.createUSDCTransferCalls(
        sender, // sender
        receiver, // receiver
        Number(fundingData.shortfall) // amount
      );
      await conversation.send("💸 Preparing funding request...");
      await conversation.send(walletCalls, ContentTypeWalletSendCalls);
      await conversation.sync();

      logger.info("Actual wallet funding request sent", {
        sender,
        receiver,
        amount: fundingData.shortfall
      });
    } catch (error) {
      logger.error("caught error in sendActualFundingRequest", error);
      await conversation.send("❌ Error preparing funding request. Please try again.");
    }
  }

  private async sendMainActionMenu(conversation: any, userInboxId: string) {
    const mainActions: ActionsContent = {
      id: `main-menu-${Date.now()}`,
      description: `Welcome to Worldstore 🌟\n\nYour AI-powered shopping assistant for Amazon. What would you like to do?`,
      actions: [
        {
          id: "know-more-worldstore",
          label: "🌐 What is Worldstore",
          style: "primary"
        },
        {
          id: "start-shopping-assistant",
          label: "🛒 Talk to your assistant",
          style: "primary"
        },
        {
          id: "view-manage-data",
          label: "👤 Your data",
          style: "secondary"
        },
        {
          id: "view-balances",
          label: "💰 Your balances",
          style: "secondary"
        }
      ]
    };

    await conversation.send(mainActions, ContentTypeActions);
    await conversation.sync();

    logger.info("Main action menu sent", { userInboxId });
  }

  private async sendProfileActionMenu(conversation: any, userInboxId: string) {
    const profileActions: ActionsContent = {
      id: `profile-menu-${Date.now()}`,
      description: `🔒 Profile Required\n\nTo place orders, we need your profile information for shipping and communication. What would you like to do?`,
      actions: [
        {
          id: "create-profile",
          label: "✅ Create your profile",
          style: "primary"
        },
        {
          id: "why-need-info",
          label: "❓ Why do we need this information?",
          style: "secondary"
        }
      ]
    };

    await conversation.send(profileActions, ContentTypeActions);
    await conversation.sync();

    logger.info("Profile action menu sent", { userInboxId });
  }

  private wrapOrderProductTool(): any {
    const originalTool = orderProductTool();

    return new DynamicStructuredTool({
      name: originalTool.name,
      description: originalTool.description,
      schema: originalTool.schema,
      func: async ({
        userInboxId,
        asin,
      }: z.infer<typeof originalTool.schema>) => {
        try {
          logger.tool(
            "wrapped_order_product",
            "🔧 Calling original order product tool"
          );
          const result = await originalTool.func({
            userInboxId,
            asin,
          });
          this.currentFundingRequirement[userInboxId] = undefined;
          logger.tool(
            "wrapped_order_product",
            "✅ Order tool completed successfully"
          );
          return result;
        } catch (error) {
          if (error instanceof InsufficientFundsError) {
            // This is where the update happens
            this.currentFundingRequirement[userInboxId] = error.fundingData;

            // Return user-friendly message to LLM
            return `❌ Insufficient funds: You need ${error.fundingData.required} USDC but only have ${error.fundingData.current} USDC. Please add ${error.fundingData.shortfall} USDC to complete your order.`;
          }

          if (error instanceof ProfileNotFoundError) {
            // Flag that we need to show profile menu after LLM response
            this.needsProfileMenu[userInboxId] = true;

            // Return user-friendly message to LLM
            return error.message;
          }

          logger.tool(
            "wrapped_order_product",
            "❌ Other error in order tool:",
            error.message
          );
          throw error; // Re-throw other errors
        }
      },
    });
  }

  private createAgent() {
    const GraphState = Annotation.Root({
      messages: Annotation<any[]>({
        reducer: (x, y) => [...x, ...y],
        default: () => [],
      }),
      userInboxId: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
      }),
      userProfile: Annotation<UserProfile | undefined>({
        reducer: (x, y) => y ?? x,
        default: () => undefined,
      }),
      lastMessage: Annotation<string>({
        reducer: (x, y) => y ?? x,
        default: () => "",
      }),
      fundingData: Annotation<FundingData | undefined>({
        reducer: (x, y) => y ?? x,
        default: () => undefined,
      }),
    });

    const workflow = new StateGraph(GraphState);

    const shoppingNode = async (
      state: AgentState
    ): Promise<Partial<AgentState>> => {
      logger.agent("🎯 Shopping agent node processing", {
        userInboxId: state.userInboxId,
        lastMessage: state.lastMessage,
      });

      try {
        this.currentFundingRequirement[state.userInboxId] = undefined;
        logger.agent("🔄 Cleared funding requirement");

        // create shopping agent
        const agent = createReactAgent({
          llm: this.llm,
          tools: [
            ...(await getTools(state.userProfile)),
            this.wrapOrderProductTool(),
          ],
          messageModifier: shoppingAssistantPrompt(state),
        });

        // only for observability
        const callbacks = {
          handleLLMStart: (llm: any, prompts: string[]) => {
            logger.agent("🔍 LLM Start", {
              userInboxId: state.userInboxId,
              promptCount: prompts.length,
              promptPreview: prompts[0]?.substring(0, 300),
            });
          },
          handleLLMEnd: (output: any) => {
            const responseText =
              output.generations?.[0]?.[0]?.text ||
              output.text ||
              JSON.stringify(output);
            logger.agent("🔍 LLM End", {
              userInboxId: state.userInboxId,
              responsePreview: responseText?.substring(0, 300),
              hasToolCall:
                responseText?.includes("order_product") ||
                responseText?.includes("edit_profile") ||
                responseText?.includes("Action:"),
              toolMentioned: responseText?.includes("order_product")
                ? "order_product"
                : responseText?.includes("edit_profile")
                  ? "edit_profile"
                  : "none",
            });
          },
          handleLLMError: (error: any) => {
            logger.agent("🔍 LLM Error", {
              userInboxId: state.userInboxId,
              error: error instanceof Error ? error.message : String(error),
            });
          },
          handleText: (text: string, runId?: string) => {
            logger.agent("📝 Agent Text", {
              userInboxId: state.userInboxId,
              text: text?.substring(0, 200),
              isThought: text?.includes("Thought:"),
              isAction: text?.includes("Action:"),
              isObservation: text?.includes("Observation:"),
              runId: runId?.substring(0, 8),
            });
          },
          handleAgentAction: (action: any, runId?: string) => {
            logger.agent("🎯 Agent Action", {
              userInboxId: state.userInboxId,
              tool: action.tool,
              toolInput: action.toolInput,
              isOrderProduct: action.tool === "order_product",
              isEditProfile: action.tool === "edit_profile",
              extractedData:
                action.tool === "order_product"
                  ? action.toolInput?.asin
                  : action.tool === "edit_profile"
                    ? `${action.toolInput?.name || ""}|${action.toolInput?.email || ""}`
                    : "other",
              runId: runId?.substring(0, 8),
            });
          },
          handleToolStart: (tool: any, input: string, runId?: string) => {
            logger.agent("🔧 Tool Start", {
              userInboxId: state.userInboxId,
              toolName: tool.name,
              toolInput: input,
              runId: runId?.substring(0, 8),
            });
          },
          handleToolEnd: (output: any, runId?: string) => {
            const outputStr =
              typeof output === "string" ? output : JSON.stringify(output);
            logger.agent("🔧 Tool End", {
              userInboxId: state.userInboxId,
              outputPreview: outputStr?.substring(0, 200),
              success:
                !outputStr?.includes("error") && !outputStr?.includes("Error"),
              runId: runId?.substring(0, 8),
            });
          },
          handleToolError: (error: any, runId?: string) => {
            logger.agent("🔧 Tool Error", {
              userInboxId: state.userInboxId,
              error: error instanceof Error ? error.message : String(error),
              runId: runId?.substring(0, 8),
            });
          },
          handleAgentFinish: (finish: any, runId?: string) => {
            logger.agent("🏁 Agent Finish", {
              userInboxId: state.userInboxId,
              returnValues: finish.returnValues,
              finalResponse: finish.log?.substring(0, 200),
              runId: runId?.substring(0, 8),
            });
          },
        };

        const result = await agent.invoke(
          {
            messages: [
              ...state.messages,
              { role: "user", content: state.lastMessage },
            ],
          },
          {
            callbacks: [callbacks],
            configurable: {
              recursionLimit: 10,
            },
          }
        );

        const lastMessage = result.messages[result.messages.length - 1];
        const responseContent = lastMessage.content as string;
        logger.agent(
          "📋 Current funding requirement:",
          this.currentFundingRequirement[state.userInboxId]
        );
        logger.agent("returning....", {
          messages: [
            ...state.messages,
            { role: "user", content: state.lastMessage },
            { role: "assistant", content: responseContent },
          ],
          userProfile: state.userProfile || undefined,
          fundingData: this.currentFundingRequirement[state.userInboxId],
        });

        return {
          messages: [
            ...state.messages,
            { role: "user", content: state.lastMessage },
            { role: "assistant", content: responseContent },
          ],
          userProfile: state.userProfile || undefined,
          fundingData: this.currentFundingRequirement[state.userInboxId],
        };
      } catch (error) {
        logger.error("🤖 Shopping agent error", {
          error: error instanceof Error ? error.message : String(error),
          userInboxId: state.userInboxId,
          lastMessage: state.lastMessage,
          fundingData: this.currentFundingRequirement[state.userInboxId],
        });

        return {
          messages: [
            ...state.messages,
            { role: "user", content: state.lastMessage },
            {
              role: "assistant",
              content: "❌ Sorry, I encountered an error. Please try again.",
            },
          ],
          userProfile: undefined,
          fundingData: this.currentFundingRequirement[state.userInboxId],
        };
      }
    };

    // Add single node
    workflow.addNode("shopping", shoppingNode);

    // Simple flow: START -> shopping -> END
    (workflow as any).addEdge(START, "shopping");
    (workflow as any).addEdge("shopping", END);

    return workflow.compile();
  }

  private async handleMessage(message: DecodedMessage) {
    const agentInboxId = this.xmtpClient.inboxId;
    const userInboxId = message.senderInboxId;
    const inboxState = await this.xmtpClient.preferences.inboxStateFromInboxIds([userInboxId]);
    const hostWalletAddress = inboxState[0].identifiers[0].identifier as string;
    try {
      const conversation =
        await this.xmtpClient.conversations.getConversationById(
          message.conversationId
        );
      if (!conversation) {
        return;
      }
      if (message.contentType?.typeId === "text") {
        const messageContent = message.content as string;
        await conversation.sync();
        const conversationHistory = await conversation.messages();


        // Check if this is a /help command or first meaningful interaction
        const isHelpCommand = messageContent.trim().toLowerCase() === '/help';
        const meaningfulMessages = conversationHistory
          .filter((msg) => msg.content !== WAITING_MESSAGE)
          .filter((msg) => msg.contentType?.typeId === "text");
        const isFirstInteraction = meaningfulMessages.length <= 1; // Just this user message

        // Check if the time difference between the last two messages is more than 3 hours
        const isLongTimeSinceLastMessage = meaningfulMessages.length >= 2 && (() => {
          const lastMessage = meaningfulMessages[meaningfulMessages.length - 1];
          const secondLastMessage = meaningfulMessages[meaningfulMessages.length - 2];

          // Try common timestamp property names used in XMTP messages
          const lastMessageTime = (lastMessage as any).sentAt || (lastMessage as any).sent || (lastMessage as any).timestamp || (lastMessage as any).createdAt;
          const secondLastMessageTime = (secondLastMessage as any).sentAt || (secondLastMessage as any).sent || (secondLastMessage as any).timestamp || (secondLastMessage as any).createdAt;

          if (lastMessageTime && secondLastMessageTime) {
            const timeDiff = Math.abs(
              new Date(lastMessageTime).getTime() - new Date(secondLastMessageTime).getTime()
            );
            const threeHoursInMs = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
            return timeDiff > threeHoursInMs;
          }

          return false;
        })();

        if (isHelpCommand || isFirstInteraction || isLongTimeSinceLastMessage) {
          await this.sendMainActionMenu(conversation, userInboxId);
          await conversation.send("Remember: you can always type /help to see this menu again.");
          return;
        }

        const agentMessages = conversationHistory
          .filter((msg) => msg.content !== WAITING_MESSAGE)
          .filter((msg) => msg.contentType?.typeId === "text")
          .map((msg) => ({
            role: msg.senderInboxId === agentInboxId ? "assistant" : "user",
            content: String(msg.content),
          }))
          .slice(-4);
        await conversation.send(WAITING_MESSAGE);
        await conversation.sync();
        const userProfile = {
          ...(await loadUserProfile(userInboxId)),
          hostWalletAddress
        };
        await saveUserProfile(userProfile);
        const initialState: AgentState = {
          messages: agentMessages,
          userInboxId,
          lastMessage: messageContent,
          userProfile,
          fundingData: this.currentFundingRequirement[userInboxId],
        };

        const finalState = await this.agent.invoke(initialState);

        const lastMessage = finalState.messages[finalState.messages.length - 1];
        if (lastMessage) {
          await conversation.send(lastMessage.content);
          await conversation.sync();
        } else {
          await conversation.send(
            "❌ Sorry, I couldn't generate a response. Please try again."
          );
        }

        if (this.currentFundingRequirement[userInboxId]) {
          // const fundingData = finalState.fundingData;
          // const hostBalance = parseFloat(fundingData.hostWalletBalance);
          // const shortfallInUsdc = parseInt(fundingData.shortfall) / Math.pow(10, 6);

          // if (hostBalance >= shortfallInUsdc) {
          const sender = userProfile.hostWalletAddress;
          const receiver = finalState.userProfile?.walletAddress;
          await this.sendFundingRequest({
            sender,
            receiver,
            fundingData: finalState.fundingData,
            conversation,
          });
          // } else {
          //                await conversation.send(
          //      `Seems like we're running a bit low on funds here. Your wallet would need to send funds to me so I can help complete your purchase. I currently have ${shortfallInUsdc.toFixed(6)} less USDC than the required amount. Could you please top up the host wallet first? Once that's done, I'll be able to send you the funds you need! 🙂`
          //    );
          //   await conversation.sync();
          // }
        }

        // Check if we need to show profile menu after order attempt
        if (this.needsProfileMenu[userInboxId]) {
          await this.sendProfileActionMenu(conversation, userInboxId);
          this.needsProfileMenu[userInboxId] = false; // Clear the flag
        }
      } else if (message.contentType?.typeId === "intent") {
        await this.handleIntentMessage(message, conversation, userInboxId);
      } else {
        logger.debug("Skipping unsupported message type", {
          contentType: message.contentType?.typeId,
          senderInboxId: message.senderInboxId,
        });
      }
    } catch (error) {
      logger.error("Error handling message", {
        error,
        messageContext: {
          senderInboxId: message?.senderInboxId,
          messageContent: message?.content,
          conversationId: message?.conversationId,
          contentType: message?.contentType?.typeId,
        },
      });
    }
  }

  private async handleIntentMessage(message: DecodedMessage, conversation: any, userInboxId: string) {
    const intentContent = message.content as IntentContent;
    logger.user("Processing intent", intentContent.actionId);

    try {
      switch (intentContent.actionId) {
        case "add-funds": {
          // Execute actual funding request
          const fundingData = this.currentFundingRequirement[userInboxId];
          if (fundingData) {
            const userProfile = await loadUserProfile(userInboxId);
            await this.sendActualFundingRequest({
              sender: userProfile.hostWalletAddress,
              receiver: userProfile?.walletAddress,
              fundingData,
              conversation,
            });
          } else {
            await conversation.send("❌ No pending funding requirement found. Please try placing your order again.");
          }
          break;
        }

        case "cancel-order":
          this.currentFundingRequirement[userInboxId] = undefined;
          await conversation.send("❌ Order cancelled. Let me know if you'd like to try something else!");
          break;

        case "check-balance":
          // Trigger balance check tool via agent
          await this.handleBalanceCheck(conversation, userInboxId);
          break;

        // New main menu actions
        case "know-more-worldstore":
          await conversation.send(`🌍 About Worldstore

Worldstore is an AI-powered shopping platform that makes Amazon shopping seamless through conversational AI. We handle everything from product search to secure payments using USDC on the Base blockchain.

Ready to start shopping? Type anything or use /help to see the menu again.`);
          break;

        case "start-shopping-assistant":
          await conversation.send(`🛒 Shopping Assistant Activated!

I'm your personal Amazon shopping assistant. I can help you:

• Search for products by name, category, or description
• Find the best deals and reviews
• Place orders with secure USDC payments
• Track your order status
• Manage your profile and preferences

Just tell me what you're looking for! For example:
"Show me wireless headphones under $100"
"I want to buy a coffee maker"
"Find books about artificial intelligence"

What can I help you find today?`);
          break;

        case "view-manage-data": {
          const userProfile = await loadUserProfile(userInboxId);
          if (userProfile && userProfile.isComplete) {
            const line2 = userProfile.shippingAddress.line2 ? `${userProfile.shippingAddress.line2}\n` : '';
            const walletInfo = userProfile.walletAddress ? `Wallet: ${userProfile.walletAddress}` : 'No wallet connected';
            await conversation.send(`👤 Your Profile Data

Name: ${userProfile.name}
Email: ${userProfile.email}
Shipping Address:
${userProfile.shippingAddress.line1}
${line2}${userProfile.shippingAddress.city}, ${userProfile.shippingAddress.state} ${userProfile.shippingAddress.postalCode}
${userProfile.shippingAddress.country}

${walletInfo}

Order History: ${userProfile.orderHistory?.length || 0} orders

To update your profile, just tell me what you'd like to change. For example: "Update my email to new@email.com" or "Change my shipping address"`);
          } else {
            await conversation.send(`👤 Profile Status: Incomplete

You don't have a complete profile yet. To place orders, I'll need:
• Your full name
• Email address
• Shipping address

Would you like to create your profile now? Just say "create my profile" or provide the information directly.`);
          }
          break;
        }

        case "view-balances": {
          await this.handleDetailedBalanceCheck(conversation, userInboxId);
          break;
        }

        // New profile menu actions
        case "create-profile":
          await conversation.send(`✅ Let's create your profile!

To get started with ordering on Amazon, I'll need a few details from you:

1. Your full name (for shipping)
2. Email address (for order confirmations)
3. Complete shipping address

You can provide this information all at once or step by step. For example:

"My name is John Smith, email john@example.com, shipping to 123 Main St, Apt 4B, New York, NY 10001, US"

Or tell me one piece at a time. What would you like to start with?`);
          break;

        case "why-need-info":
          await conversation.send(`❓ Why We Need Your Information

🚚 Shipping Details: We need your name and address to deliver your Amazon orders to the right place.

📧 Email: Required for order confirmations, tracking updates, and customer service from Amazon.

🔒 Security: All information is encrypted and stored securely. We never share your data with third parties beyond what's necessary to fulfill your orders.

💳 Payments: We use USDC cryptocurrency for secure, fast payments. Your payment details are handled through blockchain technology for maximum security.

🛡️ Privacy: You can view, update, or delete your information at any time by asking me.

Ready to create your profile? Just say "create my profile" or provide your details whenever you're ready!`);
          break;

        default:
          await conversation.send(`❌ Unknown action: ${intentContent.actionId}`);
          logger.warn("Unknown intent action", { actionId: intentContent.actionId, userInboxId });
      }
    } catch (error) {
      logger.error("Error processing intent", {
        error: error instanceof Error ? error.message : String(error),
        actionId: intentContent.actionId,
        userInboxId
      });
      await conversation.send(`❌ Error processing action: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleBalanceCheck(conversation: any, userInboxId: string) {
    try {
      const userProfile = await loadUserProfile(userInboxId);
      if (!userProfile?.walletAddress) {
        await conversation.send("❌ No wallet address found. Please complete your profile first.");
        return;
      }

      // Note: USDCHandler balance check integration pending
      await conversation.send("🔍 Checking your USDC balance...");

      // For now, send a message that balance checking would be implemented
      await conversation.send(`💰 Balance check initiated for wallet: ${userProfile.walletAddress.substring(0, 6)}...${userProfile.walletAddress.substring(-4)}\n\nNote: Full balance integration pending - this would show your current USDC balance on Base Sepolia.`);

    } catch (error) {
      logger.error("Error checking balance", { error, userInboxId });
      await conversation.send("❌ Error checking balance. Please try again.");
    }
  }

  private async handleDetailedBalanceCheck(conversation: any, userInboxId: string) {
    try {
      const userProfile = await loadUserProfile(userInboxId);
      if (!userProfile?.walletAddress) {
        await conversation.send("❌ No wallet address found. Please complete your profile first.");
        return;
      }

      await conversation.send("🔍 Checking your balances...");

      const usdcHandler = new USDCHandler("base-sepolia");

      // Check balances for both addresses
      const [userUsdcBalance, hostUsdcBalance, userEthBalance, hostEthBalance] = await Promise.all([
        usdcHandler.getUSDCBalance(userProfile.walletAddress),
        usdcHandler.getUSDCBalance(userProfile.hostWalletAddress),
        this.getETHBalance(userProfile.walletAddress),
        this.getETHBalance(userProfile.hostWalletAddress)
      ]);

      const formatAddress = (address: string) => `${address.substring(0, 6)}...${address.slice(-4)}`;

      await conversation.send(`💰 Your Wallet Balances

🏠 Your Wallet Address: ${formatAddress(userProfile.walletAddress)}
• USDC: ${parseFloat(userUsdcBalance).toFixed(4)} USDC
• ETH: ${parseFloat(userEthBalance).toFixed(6)} ETH

🎯 Host Wallet Address: ${formatAddress(userProfile.hostWalletAddress)}
• USDC: ${parseFloat(hostUsdcBalance).toFixed(4)} USDC
• ETH: ${parseFloat(hostEthBalance).toFixed(6)} ETH

All balances are on Base Sepolia network.`);

    } catch (error) {
      logger.error("Error checking detailed balance", { error, userInboxId });
      await conversation.send("❌ Error checking balances. Please try again.");
    }
  }

  private async getETHBalance(address: string): Promise<string> {
    try {
      const { createPublicClient, http, formatEther } = await import("viem");
      const { baseSepolia } = await import("viem/chains");

      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });

      const balance = await publicClient.getBalance({
        address: address as `0x${string}`,
      });

      return formatEther(balance);
    } catch (error) {
      logger.error("Error getting ETH balance", { error, address });
      return "0.0";
    }
  }

  private async startMessageStream() {
    logger.xmtp("Starting message stream...");
    await this.xmtpClient.conversations.streamAllMessages(
      async (error, message) => {
        if (error) {
          logger.error("Streaming error", error);
          return;
        }

        if (!message) {
          logger.debug("Skipping null message");
          return;
        }

        if (
          message.senderInboxId.toLowerCase() ===
          this.xmtpClient.inboxId.toLowerCase()
        ) {
          logger.debug("Skipping own message");
          return;
        }

        logger.separator();
        logger.user("Processing message", message.senderInboxId);

        try {
          const startTime = Date.now();

          await this.handleMessage(message);

          logger.timing("Message processing", Date.now() - startTime);
          logger.user("Finished processing message", message.senderInboxId);
        } catch (messageError) {
          logger.error("Error processing message", {
            error: messageError,
            messageDetails: {
              id: message?.id,
              senderInboxId: message?.senderInboxId,
              contentType: message?.contentType?.typeId,
            },
          });
        }

        logger.separator();
      }
    );
  }
  async initialize() {
    logger.info("Initializing XMTP Shopping Bot...");
    await this.initializeRedis();
    const signer = createSigner(WALLET_KEY); // for xmtp
    const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
    const signerIdentifier = (await signer.getIdentifier()).identifier;

    this.xmtpClient = (await Client.create(signer, {
      dbEncryptionKey,
      env: XMTP_ENV as XmtpEnv,
      codecs: [
        new WalletSendCallsCodec(),
        new ActionsCodec(),
        new IntentCodec()
      ],
      dbPath: getDbPath(`${XMTP_ENV}-${signerIdentifier}`),
    })) as Client;

    void logAgentDetails(this.xmtpClient);

    logger.info("Creating agent with intent-based routing...");

    this.agent = this.createAgent();

    logger.xmtp("Syncing conversations...");
    await this.xmtpClient.conversations.sync();

    logger.success("Bot initialized successfully");
    this.startMessageStream();
  }
}

async function main() {
  logger.info("Starting XMTP Shopping Bot...");
  const bot = new XMTPShoppingBot();
  await bot.initialize();
}

main().catch((error) => logger.error("Fatal error", error));

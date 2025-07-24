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
import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { WAITING_MESSAGE } from "./helpers/constants";
import { logger } from "./helpers/logger";
import {
  UserProfile,
  AgentState,
  InsufficientFundsError,
  FundingData,
} from "./lib/types";
import { USER_STORAGE_DIR } from "./helpers/constants";
import { shoppingAssistantPrompt } from "lib/prompts";
import { loadUserProfile } from "@helpers/loadUserProfile";
import { redisClient } from "./helpers/redis";
import { migrateToRedis } from "./helpers/migration";
import { getTools } from "@lib/tools";
import { orderProductTool } from "@lib/tools/product";
import {
  DynamicStructuredTool,
  type StructuredToolInterface,
} from "@langchain/core/tools";
import { USDCHandler } from "@helpers/usdc";
import z from "zod";

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

  private currentFundingRequirement: { [inboxId: string]: any } = {};

  private hostWalletAddress = "";
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

      // Auto-migrate existing data if filesystem storage exists
      if (fs.existsSync(USER_STORAGE_DIR)) {
        logger.info("Existing filesystem data detected, running migration...");
        await migrateToRedis();
      }

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
      await conversation.send(walletCalls, ContentTypeWalletSendCalls);
      await conversation.sync();
    } catch (error) {
      logger.error("caught error in sendFundingRequest", error);
    }
  }

  private wrapOrderProductTool(): StructuredToolInterface {
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
    const inboxState = await this.xmtpClient.preferences.inboxStateFromInboxIds(
      [userInboxId]
    );
    this.hostWalletAddress = inboxState[0].identifiers[0].identifier as string;
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
        const initialState: AgentState = {
          messages: agentMessages,
          userInboxId,
          lastMessage: messageContent,
          userProfile: await loadUserProfile(userInboxId),
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
          const sender = this.hostWalletAddress;
          const receiver = finalState.userProfile?.walletAddress;
          await this.sendFundingRequest({
            sender,
            receiver,
            fundingData: finalState.fundingData,
            conversation,
          });
        }
      } else {
        logger.debug("Skipping non-text message", {
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

    // Initialize Redis first
    await this.initializeRedis();

    const signer = createSigner(WALLET_KEY); // for xmtp
    const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
    const signerIdentifier = (await signer.getIdentifier()).identifier;

    this.xmtpClient = (await Client.create(signer, {
      dbEncryptionKey,
      env: XMTP_ENV as XmtpEnv,
      codecs: [new WalletSendCallsCodec()],
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

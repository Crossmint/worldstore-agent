import { validateEnvironment } from "./helpers/client";
import { Client, type DecodedMessage, type Conversation } from "@xmtp/node-sdk";
import { type IntentContent } from "./lib/types/IntentContent";
import { ChatAnthropic } from "@langchain/anthropic";
import { logger } from "./helpers/logger";
import { FundingData, UserProfile } from "./lib/types";
import { loadUserProfile } from "@helpers/loadUserProfile";
import { saveUserProfile } from "services/redis";
import { getMenuType } from "@helpers/toShowMenu";
import { UserStateManager } from "@helpers/userStateManager";
import { ActionMenuFactory } from "@helpers/actionMenuFactory";
import { ConversationProcessor } from "@helpers/conversationProcessor";
import { OrderToolWrapper } from "@helpers/orderToolWrapper";
import { WalletOperationsHandler } from "@helpers/walletOperationsHandler";
import { XMTPClientFactory } from "@helpers/xmtpClientFactory";
import {
  IntentHandler,
  type IntentHandlerContext,
} from "@helpers/intentHandlers";

const { ANTHROPIC_API_KEY } = validateEnvironment(["ANTHROPIC_API_KEY"]);

class XMTPShoppingBot {
  private xmtpClient!: Client;
  private llm: ChatAnthropic;
  private userStateManager: UserStateManager;
  private actionMenuFactory: ActionMenuFactory;
  private conversationProcessor: ConversationProcessor;
  private orderToolWrapper: OrderToolWrapper;
  private walletOperationsHandler: WalletOperationsHandler;
  private xmtpClientFactory: XMTPClientFactory;

  constructor() {
    this.llm = new ChatAnthropic({
      anthropicApiKey: ANTHROPIC_API_KEY,
      modelName: "claude-sonnet-4-20250514",
      temperature: 1,
    });

    // Initialize helper classes
    this.userStateManager = new UserStateManager();
    this.actionMenuFactory = new ActionMenuFactory();
    this.orderToolWrapper = new OrderToolWrapper(this.userStateManager);
    this.walletOperationsHandler = new WalletOperationsHandler();
    this.xmtpClientFactory = new XMTPClientFactory();

    // Initialize conversation processor (will be set after XMTP client is ready)
    this.conversationProcessor = new ConversationProcessor(
      this.llm,
      this.userStateManager,
      this.actionMenuFactory,
      this.orderToolWrapper,
      null // xmtpClient will be set later
    );
  }

  // Delegate to wallet operations handler
  private async sendActualFundingRequest({
    sender,
    receiver,
    fundingData,
    conversation,
  }: {
    sender: string;
    receiver: string;
    fundingData: FundingData;
    conversation: Conversation;
  }) {
    await this.walletOperationsHandler.sendActualFundingRequest({
      sender,
      receiver,
      fundingData,
      conversation,
    });
  }
  // Delegate to conversation processor
  private async processMessageWithAgent(
    conversation: Conversation,
    userInboxId: string,
    messageContent: string,
    userProfile: UserProfile | null,
    conversationHistory?: DecodedMessage[]
  ) {
    await this.conversationProcessor.processMessageWithAgent(
      conversation,
      userInboxId,
      messageContent,
      userProfile,
      conversationHistory
    );
  }

  private async handleMessage(message: DecodedMessage) {
    const userInboxId = message.senderInboxId;
    const inboxState = await this.xmtpClient.preferences.inboxStateFromInboxIds(
      [userInboxId]
    );
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

        const menuType = getMenuType(messageContent, conversationHistory);
        if (menuType) {
          this.userStateManager.setUserContext(userInboxId, "menu");

          switch (menuType) {
            case "help":
              await this.actionMenuFactory.sendHelpMenu(
                conversation,
                userInboxId
              );
              await conversation.send(
                "Use /menu or /agents to see AI assistants, or /help to return here."
              );
              break;

            case "agents":
              await this.actionMenuFactory.sendAgentsMenu(
                conversation,
                userInboxId
              );
              await conversation.send(
                "Use /help for information and support, or /menu to return here."
              );
              break;

            case "main":
            default:
              await this.actionMenuFactory.sendMainActionMenu(
                conversation,
                userInboxId
              );
              await conversation.send(
                "Use /help for information or /menu for AI assistants."
              );
              break;
          }

          return;
        }

        const userProfile = {
          ...(await loadUserProfile(userInboxId)),
          hostWalletAddress,
        };
        await saveUserProfile(userProfile);

        await this.processMessageWithAgent(
          conversation,
          userInboxId,
          messageContent,
          userProfile,
          conversationHistory
        );
      } else if (message.contentType?.typeId === "intent") {
        const intentContent = message.content as IntentContent;
        logger.user("Processing intent", intentContent.actionId);

        try {
          // Create intent handler context
          const handlerContext: IntentHandlerContext = {
            conversation,
            userInboxId,
            setUserContext: (
              id: string,
              context: "shopping" | "general" | "profile" | "wallet" | "menu"
            ) => {
              this.userStateManager.setUserContext(id, context);
            },
            handleBalanceCheck:
              this.walletOperationsHandler.handleBalanceCheck.bind(
                this.walletOperationsHandler
              ),
            currentFundingRequirement:
              this.userStateManager.getAllFundingRequirements(),
            sendActualFundingRequest: this.sendActualFundingRequest.bind(this),
            loadUserProfile,
            processMessageWithAgent: this.processMessageWithAgent.bind(this),
            saveUserProfile,
            xmtpClient: this.xmtpClient,
          };

          const intentHandler = new IntentHandler(handlerContext);

          // Try each handler category in order
          const handled =
            (await intentHandler.handleOrderManagement(
              intentContent.actionId
            )) ||
            (await intentHandler.handleAssistantActivation(
              intentContent.actionId
            )) ||
            (await intentHandler.handleProfileManagement(
              intentContent.actionId
            )) ||
            (await intentHandler.handleInformationalActions(
              intentContent.actionId
            )) ||
            (await intentHandler.handleQuickReply(intentContent.actionId));

          if (!handled) {
            await conversation.send(
              `❌ Unknown action: ${intentContent.actionId}`
            );
            logger.warn("Unknown intent action", {
              actionId: intentContent.actionId,
              userInboxId,
            });
          }
        } catch (error) {
          logger.error("Error processing intent", {
            error: error instanceof Error ? error.message : String(error),
            actionId: intentContent.actionId,
            userInboxId,
          });
          await conversation.send(
            `❌ Error processing action: ${error instanceof Error ? error.message : String(error)}`
          );
        }
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

  async initialize() {
    logger.info("Initializing XMTP Shopping Bot...");

    // Create XMTP client using factory
    const config = XMTPClientFactory.createConfig();
    this.xmtpClient = await this.xmtpClientFactory.createClient(config);

    // Update conversation processor with XMTP client
    this.conversationProcessor = new ConversationProcessor(
      this.llm,
      this.userStateManager,
      this.actionMenuFactory,
      this.orderToolWrapper,
      this.xmtpClient
    );

    // Start message stream
    await this.xmtpClientFactory.startMessageStream(
      this.handleMessage.bind(this)
    );
  }
}

async function main() {
  logger.info("Starting XMTP Shopping Bot...");
  const bot = new XMTPShoppingBot();
  await bot.initialize();
}

main().catch((error) => logger.error("Fatal error", error));

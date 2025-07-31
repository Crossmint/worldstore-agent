import { Conversation } from "@xmtp/node-sdk";
import { ActionsContent, ContentTypeActions } from "../lib/types/ActionsContent";
import { AGENT_EMOJIS, FundingData } from "../lib/types";
import { formatUnits } from "viem";
import { logger } from "./logger";

export class ActionMenuFactory {
  async sendMainActionMenu(conversation: Conversation, userInboxId: string): Promise<void> {
    const mainActions: ActionsContent = {
      id: `main-menu-${Date.now()}`,
      description: `Welcome to Worldstore 🌟\n\nYour AI-powered platform for Amazon shopping and Web3 services. Choose your assistant:`,
      actions: [
        {
          id: "shopping-assistant",
          label: `${AGENT_EMOJIS.SHOPPING} Shopping Assistant`,
          style: "primary",
        },
        {
          id: "general-assistant",
          label: `${AGENT_EMOJIS.GENERAL} General Assistant`,
          style: "primary",
        },
        {
          id: "profile-management",
          label: `${AGENT_EMOJIS.PROFILE} Manage Profile`,
          style: "secondary",
        },
        {
          id: "wallet-management",
          label: `${AGENT_EMOJIS.WALLET} Manage Wallet`,
          style: "secondary",
        },
      ],
    };

    await conversation.send(mainActions, ContentTypeActions);
    await conversation.sync();

    logger.info("Main action menu sent", { userInboxId });
  }

  async sendProfileActionMenu(conversation: Conversation, userInboxId: string): Promise<void> {
    const profileActions: ActionsContent = {
      id: `profile-menu-${Date.now()}`,
      description: `🔒 Profile Required\n\nTo place orders, we need your profile information for shipping and communication. What would you like to do?`,
      actions: [
        {
          id: "create-profile",
          label: "✅ Create your profile",
          style: "primary",
        },
        {
          id: "why-need-info",
          label: "❓ Why do we need this information?",
          style: "secondary",
        },
      ],
    };

    await conversation.send(profileActions, ContentTypeActions);
    await conversation.sync();

    logger.info("Profile action menu sent", { userInboxId });
  }

  async sendFundingActionMenu(
    conversation: Conversation,
    fundingData: FundingData
  ): Promise<void> {
    const fundingActions: ActionsContent = {
      id: `funding-${Date.now()}`,
      description: `💰 Insufficient funds\n\nYou need ${parseFloat(fundingData.required).toFixed(6)} USDC but only have ${parseFloat(fundingData.current).toFixed(6)} USDC.\nShortfall: ${formatUnits(BigInt(fundingData.shortfall), 6)} USDC\n\nWhat would you like to do?`,
      actions: [
        {
          id: "add-funds",
          label: "💸 Add Funds Now",
          style: "primary",
        },
        {
          id: "cancel-order",
          label: "❌ Cancel Order",
          style: "secondary",
        },
        {
          id: "check-balance",
          label: "💰 Check Balance",
          style: "secondary",
        },
      ],
    };

    await conversation.send(fundingActions, ContentTypeActions);
    await conversation.sync();

    logger.info("Funding action buttons sent", {
      shortfall: fundingData.shortfall,
      required: fundingData.required,
      current: fundingData.current,
    });
  }

  async sendQuickRepliesMenu(
    conversation: Conversation,
    quickReplies: Array<{ label: string; value: string }>
  ): Promise<void> {
    if (!quickReplies || quickReplies.length === 0) {
      return;
    }

    const quickRepliesActions: ActionsContent = {
      id: `quick-replies-${Date.now()}`,
      description: "💬 Quick Replies",
      actions: quickReplies.map((reply: { label: string; value: string }) => ({
        id: `quick-reply:${reply.value}`,
        label: reply.label,
        style: "secondary" as const,
      })),
    };

    await conversation.send(quickRepliesActions, ContentTypeActions);
    await conversation.sync();
  }
}
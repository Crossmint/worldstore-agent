/* eslint-disable no-unused-vars */
import { Conversation } from "@xmtp/node-sdk";
import { AGENT_EMOJIS, FundingData, UserProfile } from "../lib/types";

type UserContextType = "shopping" | "general" | "profile" | "wallet" | "menu";

/* eslint-disable @typescript-eslint/no-unused-vars */
export interface IntentHandlerContext {
  conversation: Conversation;
  userInboxId: string;
  setUserContext: (id: string, context: UserContextType) => void;
  handleBalanceCheck: (conversation: Conversation, id: string) => Promise<void>;
  currentFundingRequirement: Record<string, FundingData | undefined>;
  sendActualFundingRequest: (params: {
    sender: string;
    receiver: string;
    fundingData: FundingData;
    conversation: Conversation;
  }) => Promise<void>;
  loadUserProfile: (id: string) => Promise<UserProfile>;
  processMessageWithAgent: (
    conversation: Conversation,
    id: string,
    message: string,
    userProfile: UserProfile
  ) => Promise<void>;
  saveUserProfile: (profile: UserProfile) => Promise<void>;
  xmtpClient: {
    preferences: {
      inboxStateFromInboxIds: (
        inboxIds: string[]
      ) => Promise<Array<{ identifiers: Array<{ identifier: string }> }>>;
    };
  };
}
/* eslint-enable @typescript-eslint/no-unused-vars */

// Message templates for assistant activation
const ASSISTANT_MESSAGES = {
  shopping: `${AGENT_EMOJIS.SHOPPING} Shopping Assistant Activated!

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

What can I help you find today?`,

  general: `${AGENT_EMOJIS.GENERAL} General Assistant Activated!

I'm your knowledgeable assistant for Worldstore and Crossmint. I can help you with:

• Questions about Worldstore platform and features
• Information about Crossmint and Web3 infrastructure
• Blockchain and cryptocurrency explanations
• Platform capabilities and technical details
• General Web3 and DeFi concepts

Feel free to ask me anything! You can always type /menu to switch to other assistants or return to the main menu.

What would you like to know about?`,

  profile: `${AGENT_EMOJIS.PROFILE} Profile Management Activated!

I'm here to help you manage your Worldstore profile. I can assist with:

• Creating your shipping and contact profile
• Updating existing profile information
• Viewing your current profile data
• Managing your personal information securely

Let me know what you'd like to do with your profile. For example:
"Show me my current profile"
"Update my email address"
"Change my shipping address"
"Create my profile"

How can I help you with your profile today?`,

  wallet: `${AGENT_EMOJIS.WALLET} Wallet Management Activated!

I'm your wallet assistant for managing your crypto assets. I can help you with:

• Checking USDC and ETH balances on both wallets
• Understanding your wallet addresses
• Explaining Web3 wallet concepts
• Managing your crypto assets
• Transaction guidance and support

Feel free to ask about your balances, wallet addresses, or any wallet-related questions!

What would you like to know about your wallets?`,
};

const PROFILE_MESSAGES = {
  create: `✅ Let's create your profile!

To get started with ordering on Amazon, I'll need a few details from you:

1. Your full name (for shipping)
2. Email address (for order confirmations)
3. Complete shipping address

You can provide this information all at once or step by step. For example:

"My name is John Smith, email john@example.com, shipping to 123 Main St, Apt 4B, New York, NY 10001, US"

Or tell me one piece at a time. What would you like to start with?`,

  whyNeedInfo: `❓ Why We Need Your Information

🚚 Shipping Details: We need your name and address to deliver your Amazon orders to the right place.

📧 Email: Required for order confirmations, tracking updates, and customer service from Amazon.

🔒 Security: All information is encrypted and stored securely. We never share your data with third parties beyond what's necessary to fulfill your orders.

💳 Payments: We use USDC cryptocurrency for secure, fast payments. Your payment details are handled through blockchain technology for maximum security.

🛡️ Privacy: You can view, update, or delete your information at any time by asking me.

Ready to create your profile? Just say "create my profile" or provide your details whenever you're ready!`,
};

const INFORMATIONAL_MESSAGES = {
  howItWorks: `❓ How Worldstore Works

Worldstore is your AI-powered bot that combines Amazon shopping with Web3 payments.

It's primary purpose is to allow you to shop on Amazon using your crypto wallet. It currently supports USDC on Base. You can interact with it using natural language. Start by selecting the assistant you'd like to use.

Send /agents to see the list of assistants. Send /help to see the help menu. Send /menu to return to the main menu.
`,

  getSupport: `🆘 Need Help? We're Here for You!

If you need assistance, have questions, or encounter any issues, please reach out to our support team:

📧 **Email**: help@crossmint.io

Our support team is available to help with:
• Account and profile issues
• Payment and wallet problems
• Order questions and concerns
• Technical troubleshooting
• Platform guidance

**Before contacting support, you can also:**
• Type **/menu** to return to the main menu
• Use the "❓ How it works" button for guidance
• Try the General Assistant for platform questions

We're committed to providing you with the best possible experience on Worldstore! 🌟`,
};

export class IntentHandler {
  private context: IntentHandlerContext;

  constructor(context: IntentHandlerContext) {
    this.context = context;
  }

  async handleOrderManagement(actionId: string): Promise<boolean> {
    const { conversation, userInboxId } = this.context;

    switch (actionId) {
      case "add-funds": {
        const fundingData = this.context.currentFundingRequirement[userInboxId];
        if (fundingData) {
          const userProfile = await this.context.loadUserProfile(userInboxId);
          await this.context.sendActualFundingRequest({
            sender: userProfile.hostWalletAddress,
            receiver: userProfile?.walletAddress,
            fundingData,
            conversation,
          });
        } else {
          await conversation.send(
            "❌ No pending funding requirement found. Please try placing your order again."
          );
        }
        return true;
      }

      case "cancel-order":
        this.context.currentFundingRequirement[userInboxId] = undefined;
        await conversation.send(
          "❌ Order cancelled. Let me know if you'd like to try something else!"
        );
        return true;

      case "check-balance":
        await this.context.handleBalanceCheck(conversation, userInboxId);
        return true;

      default:
        return false;
    }
  }

  async handleAssistantActivation(actionId: string): Promise<boolean> {
    const { conversation, userInboxId, setUserContext } = this.context;

    const assistantMap: Record<
      string,
      { context: UserContextType; message: string }
    > = {
      "shopping-assistant": {
        context: "shopping",
        message: ASSISTANT_MESSAGES.shopping,
      },
      "general-assistant": {
        context: "general",
        message: ASSISTANT_MESSAGES.general,
      },
      "profile-management": {
        context: "profile",
        message: ASSISTANT_MESSAGES.profile,
      },
      "wallet-management": {
        context: "wallet",
        message: ASSISTANT_MESSAGES.wallet,
      },
    };

    const assistant = assistantMap[actionId];
    if (assistant) {
      setUserContext(userInboxId, assistant.context);
      await conversation.send(assistant.message);
      return true;
    }

    return false;
  }

  async handleProfileManagement(actionId: string): Promise<boolean> {
    const { conversation } = this.context;

    switch (actionId) {
      case "create-profile":
        await conversation.send(PROFILE_MESSAGES.create);
        return true;

      case "why-need-info":
        await conversation.send(PROFILE_MESSAGES.whyNeedInfo);
        return true;

      default:
        return false;
    }
  }

  async handleInformationalActions(actionId: string): Promise<boolean> {
    const { conversation } = this.context;

    switch (actionId) {
      case "how-it-works":
        await conversation.send(INFORMATIONAL_MESSAGES.howItWorks);
        return true;

      case "get-support":
        await conversation.send(INFORMATIONAL_MESSAGES.getSupport);
        return true;

      default:
        return false;
    }
  }

  async handleQuickReply(actionId: string): Promise<boolean> {
    if (!actionId.startsWith("quick-reply:")) {
      return false;
    }

    const { conversation, userInboxId } = this.context;
    const quickReplyValue = actionId.replace("quick-reply:", "");

    // Process quick reply through the current agent context
    const userProfile = {
      ...(await this.context.loadUserProfile(userInboxId)),
      hostWalletAddress: (
        await this.context.xmtpClient.preferences.inboxStateFromInboxIds([
          userInboxId,
        ])
      )[0].identifiers[0].identifier as string,
    };
    await this.context.saveUserProfile(userProfile);

    await this.context.processMessageWithAgent(
      conversation,
      userInboxId,
      quickReplyValue,
      userProfile
    );

    return true;
  }
}

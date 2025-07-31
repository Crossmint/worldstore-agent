import { Conversation } from "@xmtp/node-sdk";
import { ContentTypeWalletSendCalls } from "@xmtp/content-type-wallet-send-calls";
import { USDCHandler } from "./usdc";
import { FundingData, UserProfile } from "../lib/types";
import { loadUserProfile } from "./loadUserProfile";
import { logger } from "./logger";

export class WalletOperationsHandler {
  private usdcHandler: USDCHandler;

  constructor() {
    this.usdcHandler = new USDCHandler("base-sepolia");
  }

  async sendActualFundingRequest({
    sender,
    receiver,
    fundingData,
    conversation,
  }: {
    sender: string;
    receiver: string;
    fundingData: FundingData;
    conversation: Conversation;
  }): Promise<void> {
    try {
      const walletCalls = this.usdcHandler.createUSDCTransferCalls(
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
        amount: fundingData.shortfall,
      });
    } catch (error) {
      logger.error("Error in sendActualFundingRequest", error);
      await conversation.send(
        "❌ Error preparing funding request. Please try again."
      );
    }
  }

  async handleBalanceCheck(conversation: Conversation, userInboxId: string): Promise<void> {
    try {
      const userProfile = await loadUserProfile(userInboxId);
      if (!userProfile?.walletAddress) {
        await conversation.send(
          "❌ No wallet address found. Please complete your profile first."
        );
        return;
      }

      await conversation.send("🔍 Checking your USDC balance...");

      // For now, send a message that balance checking would be implemented
      // TODO: Implement actual balance checking with USDCHandler
      await conversation.send(
        `💰 Balance check initiated for wallet: ${userProfile.walletAddress.substring(0, 6)}...${userProfile.walletAddress.substring(-4)}\n\nNote: Full balance integration pending - this would show your current USDC balance on Base Sepolia.`
      );
    } catch (error) {
      logger.error("Error checking balance", { error, userInboxId });
      await conversation.send("❌ Error checking balance. Please try again.");
    }
  }

  async getWalletBalance(walletAddress: string): Promise<string | null> {
    try {
      // TODO: Implement actual balance checking
      // const balance = await this.usdcHandler.getBalance(walletAddress);
      // return balance;

      // Placeholder implementation
      logger.info("Balance check requested for", { walletAddress });
      return null;
    } catch (error) {
      logger.error("Error getting wallet balance", { error, walletAddress });
      return null;
    }
  }

  validateWalletAddress(address: string): boolean {
    try {
      // Basic validation - could be enhanced
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    } catch {
      return false;
    }
  }
}
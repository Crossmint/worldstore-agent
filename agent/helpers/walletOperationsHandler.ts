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

  async handleBalanceCheck(
    conversation: Conversation,
    userInboxId: string
  ): Promise<void> {
    try {
      const userProfile = await loadUserProfile(userInboxId);
      if (!userProfile?.walletAddress) {
        await conversation.send(
          "❌ No wallet address found. Please complete your profile first."
        );
        return;
      }

      await conversation.send("🔍 Checking your balances...");

      // Get both USDC and ETH balances
      const [usdcBalance, ethBalance] = await Promise.allSettled([
        this.usdcHandler.getUSDCBalance(userProfile.walletAddress),
        this.usdcHandler.getETHBalance(userProfile.walletAddress)
      ]);

      const walletPreview = `${userProfile.walletAddress.substring(0, 6)}...${userProfile.walletAddress.slice(-4)}`;

      let balanceMessage = `💰 **Balance Report for ${walletPreview}**\n\n`;

      // Handle USDC balance result
      if (usdcBalance.status === 'fulfilled') {
        const usdcAmount = parseFloat(usdcBalance.value);
        balanceMessage += `💵 **USDC**: ${usdcAmount.toFixed(2)} USDC\n`;

        // Add context about balance
        if (usdcAmount === 0) {
          balanceMessage += `   ⚠️ No USDC balance found\n`;
        } else if (usdcAmount < 1) {
          balanceMessage += `   ⚠️ Low USDC balance\n`;
        } else {
          balanceMessage += `   ✅ Good USDC balance\n`;
        }
      } else {
        balanceMessage += `💵 **USDC**: ❌ Error fetching balance\n`;
        logger.error("USDC balance fetch error", { error: usdcBalance.reason, userInboxId });
      }

      // Handle ETH balance result
      if (ethBalance.status === 'fulfilled') {
        const ethAmount = parseFloat(ethBalance.value);
        balanceMessage += `⛽ **ETH**: ${ethAmount.toFixed(4)} ETH\n`;

        // Add context about gas fees
        if (ethAmount === 0) {
          balanceMessage += `   ⚠️ No ETH for gas fees\n`;
        } else if (ethAmount < 0.001) {
          balanceMessage += `   ⚠️ Low ETH - may not cover gas fees\n`;
        } else {
          balanceMessage += `   ✅ Sufficient ETH for transactions\n`;
        }
      } else {
        balanceMessage += `⛽ **ETH**: ❌ Error fetching balance\n`;
        logger.error("ETH balance fetch error", { error: ethBalance.reason, userInboxId });
      }

      balanceMessage += `\n🌐 **Network**: Base Sepolia\n`;
      balanceMessage += `📍 **Wallet**: [${userProfile.walletAddress}](https://sepolia.basescan.org/address/${userProfile.walletAddress})`;

      await conversation.send(balanceMessage);

      logger.info("Balance check completed", {
        userInboxId,
        walletAddress: userProfile.walletAddress,
        usdcSuccess: usdcBalance.status === 'fulfilled',
        ethSuccess: ethBalance.status === 'fulfilled'
      });

    } catch (error) {
      logger.error("Error checking balance", { error, userInboxId });
      await conversation.send("❌ Error checking balance. Please try again.");
    }
  }
}

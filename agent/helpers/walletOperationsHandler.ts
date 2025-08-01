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

      await conversation.send("🔍 Checking balances for both your wallet and host wallet...");

      // Get balances for both user wallet and host wallet
      const [userUsdcBalance, userEthBalance, hostUsdcBalance, hostEthBalance] = await Promise.allSettled([
        this.usdcHandler.getUSDCBalance(userProfile.walletAddress),
        this.usdcHandler.getETHBalance(userProfile.walletAddress),
        this.usdcHandler.getUSDCBalance(userProfile.hostWalletAddress),
        this.usdcHandler.getETHBalance(userProfile.hostWalletAddress)
      ]);

      const userWalletPreview = `${userProfile.walletAddress.substring(0, 6)}...${userProfile.walletAddress.slice(-4)}`;
      const hostWalletPreview = `${userProfile.hostWalletAddress.substring(0, 6)}...${userProfile.hostWalletAddress.slice(-4)}`;
      
      let balanceMessage = `💰 Balance Report\n\n`;
      
      // User Wallet Section
      balanceMessage += `YOUR WALLET (${userWalletPreview}):\n`;
      
      // User USDC balance
      if (userUsdcBalance.status === 'fulfilled') {
        const usdcAmount = parseFloat(userUsdcBalance.value);
        balanceMessage += `💵 USDC: ${usdcAmount.toFixed(2)} USDC`;
        
        if (usdcAmount === 0) {
          balanceMessage += ` (No balance)\n`;
        } else if (usdcAmount < 1) {
          balanceMessage += ` (Low balance)\n`;
        } else {
          balanceMessage += ` (Good balance)\n`;
        }
      } else {
        balanceMessage += `💵 USDC: Error fetching balance\n`;
        logger.error("User USDC balance fetch error", { error: userUsdcBalance.reason, userInboxId });
      }

      // User ETH balance
      if (userEthBalance.status === 'fulfilled') {
        const ethAmount = parseFloat(userEthBalance.value);
        balanceMessage += `⛽ ETH: ${ethAmount.toFixed(4)} ETH`;
        
        if (ethAmount === 0) {
          balanceMessage += ` (No gas fees available)\n`;
        } else if (ethAmount < 0.001) {
          balanceMessage += ` (Low - may not cover gas)\n`;
        } else {
          balanceMessage += ` (Sufficient for transactions)\n`;
        }
      } else {
        balanceMessage += `⛽ ETH: Error fetching balance\n`;
        logger.error("User ETH balance fetch error", { error: userEthBalance.reason, userInboxId });
      }

      balanceMessage += `\n`;

      // Host Wallet Section
      balanceMessage += `HOST WALLET (${hostWalletPreview}):\n`;
      
      // Host USDC balance
      if (hostUsdcBalance.status === 'fulfilled') {
        const usdcAmount = parseFloat(hostUsdcBalance.value);
        balanceMessage += `💵 USDC: ${usdcAmount.toFixed(2)} USDC`;
        
        if (usdcAmount === 0) {
          balanceMessage += ` (No balance)\n`;
        } else if (usdcAmount < 1) {
          balanceMessage += ` (Low balance)\n`;
        } else {
          balanceMessage += ` (Good balance)\n`;
        }
      } else {
        balanceMessage += `💵 USDC: Error fetching balance\n`;
        logger.error("Host USDC balance fetch error", { error: hostUsdcBalance.reason, userInboxId });
      }

      // Host ETH balance
      if (hostEthBalance.status === 'fulfilled') {
        const ethAmount = parseFloat(hostEthBalance.value);
        balanceMessage += `⛽ ETH: ${ethAmount.toFixed(4)} ETH`;
        
        if (ethAmount === 0) {
          balanceMessage += ` (No gas fees available)\n`;
        } else if (ethAmount < 0.001) {
          balanceMessage += ` (Low - may not cover gas)\n`;
        } else {
          balanceMessage += ` (Sufficient for transactions)\n`;
        }
      } else {
        balanceMessage += `⛽ ETH: Error fetching balance\n`;
        logger.error("Host ETH balance fetch error", { error: hostEthBalance.reason, userInboxId });
      }

      balanceMessage += `\n🌐 Network: Base Sepolia`;
      balanceMessage += `\n📍 User Wallet: ${userProfile.walletAddress}`;
      balanceMessage += `\n📍 Host Wallet: ${userProfile.hostWalletAddress}`;

      await conversation.send(balanceMessage);

      logger.info("Balance check completed", {
        userInboxId,
        userWalletAddress: userProfile.walletAddress,
        hostWalletAddress: userProfile.hostWalletAddress,
        userUsdcSuccess: userUsdcBalance.status === 'fulfilled',
        userEthSuccess: userEthBalance.status === 'fulfilled',
        hostUsdcSuccess: hostUsdcBalance.status === 'fulfilled',
        hostEthSuccess: hostEthBalance.status === 'fulfilled'
      });

    } catch (error) {
      logger.error("Error checking balance", { error, userInboxId });
      await conversation.send("❌ Error checking balance. Please try again.");
    }
  }
}

import { Client, type XmtpEnv } from "@xmtp/node-sdk";
import { logger } from "./logger";
import { validateEnvironment } from "./client";

/**
 * Gets the host wallet address for a given user inbox ID
 * This uses the XMTP Client static method to avoid dependency injection issues
 */
export const getHostWalletAddress = async (userInboxId: string): Promise<string> => {
  try {
    logger.tool("getHostWalletAddress", "Fetching host wallet for inbox", { userInboxId });
    const { XMTP_ENV } = validateEnvironment([
      "XMTP_ENV",
    ]);


    const inboxState = await Client.inboxStateFromInboxIds(
      [userInboxId],
      XMTP_ENV as XmtpEnv
    );

    if (!inboxState || inboxState.length === 0) {
      throw new Error(`No inbox state found for inbox ID: ${userInboxId}`);
    }

    const hostWalletAddress = inboxState[0].identifiers[0].identifier as string;

    if (!hostWalletAddress) {
      throw new Error(`No host wallet address found for inbox ID: ${userInboxId}`);
    }

    logger.tool("getHostWalletAddress", "Successfully retrieved host wallet", {
      userInboxId,
      hostWalletAddress: `${hostWalletAddress.substring(0, 6)}...${hostWalletAddress.slice(-4)}`
    });

    return hostWalletAddress;
  } catch (error) {
    logger.error("Failed to get host wallet address", {
      userInboxId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
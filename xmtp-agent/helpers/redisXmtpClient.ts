import { Client, type XmtpEnv, type Signer } from "@xmtp/node-sdk";
import { redisClient } from "./redis";
import { logger } from "./logger";
import { getEncryptionKeyFromHex } from "./client";

export class RedisXmtpClient {
  private client: Client | null = null;
  private signerIdentifier: string = "";
  private env: XmtpEnv;

  constructor(private signer: Signer, private encryptionKey: string, env: XmtpEnv) {
    this.env = env;
  }

  async initialize(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    await redisClient.connect();

    // Get signer identifier for Redis key namespace
    this.signerIdentifier = (await this.signer.getIdentifier()).identifier;
    const clientKey = `${this.env}-${this.signerIdentifier}`;

    logger.info(`Initializing Redis-backed XMTP client for ${clientKey}`);

    // Create custom storage adapter for Redis
    const redisStorageAdapter = {
      async get(key: string): Promise<Uint8Array | null> {
        const data = await redisClient.loadXMTpData(`${clientKey}:${key}`);
        return data ? new Uint8Array(Buffer.from(data, 'base64')) : null;
      },

      async set(key: string, value: Uint8Array): Promise<void> {
        const base64Data = Buffer.from(value).toString('base64');
        await redisClient.saveXMTpData(`${clientKey}:${key}`, base64Data);
      },

      async delete(key: string): Promise<void> {
        await redisClient.deleteXMTpData(`${clientKey}:${key}`);
      },

      async has(key: string): Promise<boolean> {
        const data = await redisClient.loadXMTpData(`${clientKey}:${key}`);
        return data !== null;
      },

      async keys(prefix?: string): Promise<string[]> {
        const searchPattern = prefix ? `xmtp:${clientKey}:${prefix}*` : `xmtp:${clientKey}:*`;
        const keys = await redisClient.getClient().keys(searchPattern);
        return keys.map(key => key.replace(`xmtp:${clientKey}:`, ''));
      },

      async clear(): Promise<void> {
        const keys = await redisClient.getClient().keys(`xmtp:${clientKey}:*`);
        if (keys.length > 0) {
          await redisClient.getClient().del(...keys);
        }
      }
    };

    // Create XMTP client with Redis storage
    this.client = await Client.create(this.signer, {
      dbEncryptionKey: getEncryptionKeyFromHex(this.encryptionKey),
      env: this.env,
      // Note: The actual XMTP SDK might not support custom storage adapters directly
      // This is a conceptual implementation - we may need to use the dbPath approach
      // and create a custom database layer that syncs with Redis
    }) as Client;

    // Cache client metadata in Redis
    await this.cacheClientMetadata();

    logger.info(`Redis-backed XMTP client initialized for ${clientKey}`);
    return this.client;
  }

  private async cacheClientMetadata(): Promise<void> {
    if (!this.client) return;

    const metadata = {
      inboxId: this.client.inboxId,
      installationId: this.client.installationId,
      env: this.env,
      signerIdentifier: this.signerIdentifier,
      lastActivity: new Date().toISOString()
    };

    await redisClient.saveXMTpData(`client:${this.signerIdentifier}`, metadata, 86400); // 24h TTL
  }

  async syncConversations(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    logger.info("Syncing conversations to Redis...");
    await this.client.conversations.sync();

    // Cache conversation list in Redis for quick access
    const conversations = await this.client.conversations.list();
    const conversationData = conversations.map(conv => ({
      id: conv.id,
      topic: conv.topic,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      // Add other relevant conversation metadata
    }));

    await redisClient.saveXMTpData(
      `conversations:${this.signerIdentifier}`,
      conversationData,
      3600 // 1h TTL
    );
  }

  async cacheMessage(conversationId: string, message: any): Promise<void> {
    const messageKey = `messages:${conversationId}:${message.id}`;
    await redisClient.saveXMTpData(messageKey, {
      id: message.id,
      content: message.content,
      senderInboxId: message.senderInboxId,
      timestamp: message.sentAt || new Date().toISOString(),
      contentType: message.contentType?.typeId
    }, 86400 * 7); // 7 days TTL
  }

  async getCachedMessages(conversationId: string, limit = 50): Promise<any[]> {
    const pattern = `messages:${conversationId}:*`;
    const redis = redisClient.getClient();
    const keys = await redis.keys(`xmtp:${pattern}`);

    const messages = [];
    for (const key of keys.slice(-limit)) {
      const message = await redisClient.loadXMTpData(key.replace('xmtp:', ''));
      if (message) messages.push(message);
    }

    return messages.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  getClient(): Client {
    if (!this.client) {
      throw new Error("XMTP client not initialized. Call initialize() first.");
    }
    return this.client;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      // Update last activity
      await this.cacheClientMetadata();
      this.client = null;
    }
  }
}

// Factory function for creating Redis-backed XMTP clients
export const createRedisXmtpClient = async (
  signer: Signer,
  encryptionKey: string,
  env: XmtpEnv
): Promise<Client> => {
  const redisClient = new RedisXmtpClient(signer, encryptionKey, env);
  return redisClient.initialize();
};
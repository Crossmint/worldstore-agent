import Redis from "ioredis";
import { logger } from "./logger";
import { UserProfile } from "../lib/types";

class RedisClient {
  private client: Redis;
  private isConnected = false;

  constructor() {
    const redisConfig = {
      host: process.env.REDIS_HOST ?? "localhost",
      port: parseInt(process.env.REDIS_PORT ?? "6379"),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB ?? "0"),
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };

    this.client = new Redis(redisConfig);

    this.client.on("connect", () => {
      logger.info("Redis connected successfully");
      this.isConnected = true;
    });

    this.client.on("error", (error) => {
      logger.error("Redis connection error:", error);
      this.isConnected = false;
    });

    this.client.on("ready", () => {
      logger.info("Redis ready for operations");
      this.createIndexes().catch((err) =>
        logger.warn("Index creation warning:", err.message)
      );
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
    this.isConnected = false;
  }

  private async createIndexes(): Promise<void> {
    try {
      // Create user profiles index
      await this.client.call(
        "FT.CREATE",
        "idx:users",
        "ON",
        "JSON",
        "PREFIX",
        "1",
        "user:",
        "SCHEMA",
        "$.inboxId",
        "AS",
        "inboxId",
        "TEXT",
        "$.email",
        "AS",
        "email",
        "TEXT",
        "$.name",
        "AS",
        "name",
        "TEXT",
        "$.shippingAddress.city",
        "AS",
        "city",
        "TEXT",
        "$.shippingAddress.state",
        "AS",
        "state",
        "TEXT",
        "$.isComplete",
        "AS",
        "complete",
        "TAG",
        "$.walletAddress",
        "AS",
        "walletAddress",
        "TEXT"
      );
      logger.info("Created user profiles search index");
    } catch (error) {
      if (!error.message?.includes("Index already exists")) {
        logger.warn("Failed to create user index:", error.message);
      }
    }

    try {
      // Create orders index for order history
      await this.client.call(
        "FT.CREATE",
        "idx:orders",
        "ON",
        "JSON",
        "PREFIX",
        "1",
        "order:",
        "SCHEMA",
        "$.id",
        "AS",
        "orderId",
        "TEXT",
        "$.userId",
        "AS",
        "userId",
        "TEXT",
        "$.timestamp",
        "AS",
        "timestamp",
        "NUMERIC",
        "$.status",
        "AS",
        "status",
        "TAG",
        "$.totalPrice",
        "AS",
        "price",
        "NUMERIC"
      );
      logger.info("Created orders search index");
    } catch (error) {
      if (!error.message?.includes("Index already exists")) {
        logger.warn("Failed to create orders index:", error.message);
      }
    }
  }

  // User Profile Operations
  async saveUserProfile(profile: UserProfile): Promise<void> {
    const key = `user:${profile.inboxId}`;
    await this.client.call("JSON.SET", key, "$", JSON.stringify(profile));
    logger.info(`Saved user profile: ${profile.inboxId}`);
  }

  async loadUserProfile(inboxId: string): Promise<UserProfile | null> {
    const key = `user:${inboxId}`;
    const result = await this.client.call("JSON.GET", key, "$");

    if (!result) return null;

    const parsed = JSON.parse(result as string);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  }

  async appendUserOrder(inboxId: string, order: any): Promise<void> {
    const key = `user:${inboxId}`;
    await this.client.call(
      "JSON.ARRAPPEND",
      key,
      "$.orderHistory",
      JSON.stringify(order)
    );
    logger.info(`Added order to user ${inboxId}: ${order.id}`);
  }

  async getUserOrderHistory(inboxId: string): Promise<any[]> {
    const key = `user:${inboxId}`;
    const result = await this.client.call("JSON.GET", key, "$.orderHistory");

    if (!result) return [];

    const parsed = JSON.parse(result as string);
    return Array.isArray(parsed) ? parsed[0] || [] : [];
  }

  // XMTP Database Operations
  async saveXMTpData(key: string, data: any, ttl?: number): Promise<void> {
    const redisKey = `xmtp:${key}`;

    if (typeof data === "object") {
      await this.client.call("JSON.SET", redisKey, "$", JSON.stringify(data));
    } else {
      await this.client.set(redisKey, data);
    }

    if (ttl) {
      await this.client.expire(redisKey, ttl);
    }

    logger.debug(`Saved XMTP data: ${redisKey}`);
  }

  async loadXMTpData(key: string): Promise<any> {
    const redisKey = `xmtp:${key}`;

    // Try JSON first
    try {
      const jsonResult = await this.client.call("JSON.GET", redisKey, "$");
      if (jsonResult) {
        const parsed = JSON.parse(jsonResult as string);
        return Array.isArray(parsed) ? parsed[0] : parsed;
      }
    } catch {
      // Fall back to regular GET
      return await this.client.get(redisKey);
    }

    return null;
  }

  async deleteXMTpData(key: string): Promise<void> {
    const redisKey = `xmtp:${key}`;
    await this.client.del(redisKey);
    logger.debug(`Deleted XMTP data: ${redisKey}`);
  }

  // Conversation state caching
  async cacheConversationState(
    inboxId: string,
    state: any,
    ttl = 3600
  ): Promise<void> {
    const key = `conversation:${inboxId}`;
    await this.client.setex(key, ttl, JSON.stringify(state));
  }

  async getCachedConversationState(inboxId: string): Promise<any> {
    const key = `conversation:${inboxId}`;
    const cached = await this.client.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // Analytics and monitoring
  async trackUserActivity(inboxId: string, action: string): Promise<void> {
    const date = new Date().toISOString().split("T")[0];
    const key = `activity:${inboxId}:${date}`;
    await this.client.hincrby(key, action, 1);
    await this.client.expire(key, 86400 * 7); // 7 days retention
  }

  // Search operations
  async searchUsers(query: string): Promise<UserProfile[]> {
    try {
      const result = await this.client.call(
        "FT.SEARCH",
        "idx:users",
        query,
        "LIMIT",
        "0",
        "50"
      );
      const users: UserProfile[] = [];

      if (Array.isArray(result) && result.length > 1) {
        for (let i = 1; i < result.length; i += 2) {
          if (result[i + 1] && typeof result[i + 1] === "object") {
            const userData = result[i + 1] as any;
            if (userData["$"]) {
              users.push(JSON.parse(userData["$"]));
            }
          }
        }
      }

      return users;
    } catch (error) {
      logger.warn("User search failed:", error.message);
      return [];
    }
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }

  // Get Redis client for advanced operations
  getClient(): Redis {
    return this.client;
  }
}

// Singleton instance
export const redisClient = new RedisClient();

// Helper functions for backward compatibility
export const saveUserProfile = async (profile: UserProfile): Promise<void> => {
  await redisClient.connect();
  return redisClient.saveUserProfile(profile);
};

export const loadUserProfile = async (
  inboxId: string
): Promise<UserProfile | null> => {
  await redisClient.connect();
  return redisClient.loadUserProfile(inboxId);
};

export const saveUserOrderId = async ({
  profile,
  order,
}: {
  profile: UserProfile;
  order: any;
}): Promise<void> => {
  await redisClient.connect();
  return redisClient.appendUserOrder(profile.inboxId, order);
};

export const loadUserOrders = async (inboxId: string): Promise<any[]> => {
  await redisClient.connect();
  return redisClient.getUserOrderHistory(inboxId);
};

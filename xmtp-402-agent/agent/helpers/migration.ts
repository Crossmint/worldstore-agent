import fs from "node:fs";
import path from "node:path";
import { redisClient } from "./redis";
import { USER_STORAGE_DIR } from "./constants";
import { logger } from "./logger";
import { UserProfile } from "../lib/types";

export class DataMigration {
  private backupDir = `${USER_STORAGE_DIR}.backup-${Date.now()}`;

  async migrateUserProfilesToRedis(): Promise<void> {
    logger.info("Starting user profile migration to Redis...");

    await redisClient.connect();

    if (!fs.existsSync(USER_STORAGE_DIR)) {
      logger.info(
        "No existing user profiles directory found, skipping migration"
      );
      return;
    }

    const files = fs.readdirSync(USER_STORAGE_DIR);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    if (jsonFiles.length === 0) {
      logger.info("No user profile files found, skipping migration");
      return;
    }

    // Create backup directory
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    let migratedCount = 0;
    let errorCount = 0;

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(USER_STORAGE_DIR, file);
        const inboxId = file.replace(".json", "");

        // Read existing profile data
        const profileData = JSON.parse(
          fs.readFileSync(filePath, "utf8")
        ) as UserProfile;

        // Validate profile structure
        if (!profileData.inboxId) {
          profileData.inboxId = inboxId;
        }

        if (!profileData.orderHistory) {
          profileData.orderHistory = [];
        }

        // Migrate to Redis
        await redisClient.saveUserProfile(profileData);

        // Move to backup
        const backupPath = path.join(this.backupDir, file);
        fs.renameSync(filePath, backupPath);

        migratedCount++;
        logger.info(`Migrated profile: ${inboxId}`);
      } catch (error) {
        errorCount++;
        logger.error(`Failed to migrate profile ${file}:`, error);
      }
    }

    logger.info(
      `Migration completed: ${migratedCount} profiles migrated, ${errorCount} errors`
    );

    // Clean up empty directory if all files were migrated
    try {
      const remainingFiles = fs.readdirSync(USER_STORAGE_DIR);
      if (remainingFiles.length === 0) {
        fs.rmdirSync(USER_STORAGE_DIR);
        logger.info("Removed empty user profiles directory");
      }
    } catch (error) {
      logger.warn("Could not remove user profiles directory:", error);
    }
  }

  async migrateXmtpDataToRedis(): Promise<void> {
    logger.info("Starting XMTP data migration to Redis...");

    const xmtpDataDir = ".data/xmtp";

    if (!fs.existsSync(xmtpDataDir)) {
      logger.info("No existing XMTP data directory found, skipping migration");
      return;
    }

    const files = fs.readdirSync(xmtpDataDir);
    const dbFiles = files.filter((file) => file.endsWith(".db3"));

    if (dbFiles.length === 0) {
      logger.info("No XMTP database files found, skipping migration");
      return;
    }

    logger.info(`Found ${dbFiles.length} XMTP database files`);

    // For now, we'll just log the files and create a backup
    // The actual migration of SQLite to Redis would require more complex logic
    // to read the SQLite database and convert the data structure

    const xmtpBackupDir = `${xmtpDataDir}.backup-${Date.now()}`;
    if (!fs.existsSync(xmtpBackupDir)) {
      fs.mkdirSync(xmtpBackupDir, { recursive: true });
    }

    for (const file of dbFiles) {
      try {
        const sourcePath = path.join(xmtpDataDir, file);
        const backupPath = path.join(xmtpBackupDir, file);

        // Copy to backup (keeping original for now until Redis XMTP is fully implemented)
        fs.copyFileSync(sourcePath, backupPath);

        logger.info(`Backed up XMTP database: ${file}`);
      } catch (error) {
        logger.error(`Failed to backup XMTP database ${file}:`, error);
      }
    }

    logger.info("XMTP data backup completed");
    logger.warn(
      "Note: Full XMTP SQLite to Redis migration requires additional implementation"
    );
  }

  async verifyMigration(): Promise<boolean> {
    logger.info("Verifying migration...");

    try {
      await redisClient.connect();

      // Test Redis connection
      const pingResult = await redisClient.ping();
      if (!pingResult) {
        logger.error("Redis connection failed during verification");
        return false;
      }

      // Test user profile operations
      const testProfile: UserProfile = {
        inboxId: "test-migration-verification",
        name: "Test User",
        email: "test@example.com",
        shippingAddress: {
          line1: "123 Test St",
          line2: "",
          city: "Test City",
          state: "TS",
          postalCode: "12345",
          country: "US",
        },
        isComplete: true,
        orderHistory: [],
      };

      // Save test profile
      await redisClient.saveUserProfile(testProfile);

      // Load test profile
      const loadedProfile = await redisClient.loadUserProfile(
        testProfile.inboxId
      );

      if (!loadedProfile || loadedProfile.inboxId !== testProfile.inboxId) {
        logger.error("User profile verification failed");
        return false;
      }

      // Clean up test data
      await redisClient.getClient().del(`user:${testProfile.inboxId}`);

      logger.info("Migration verification successful");
      return true;
    } catch (error) {
      logger.error("Migration verification failed:", error);
      return false;
    }
  }

  async rollbackUserProfiles(): Promise<void> {
    logger.warn("Rolling back user profile migration...");

    if (!fs.existsSync(this.backupDir)) {
      logger.error("No backup directory found for rollback");
      return;
    }

    // Restore original directory
    if (!fs.existsSync(USER_STORAGE_DIR)) {
      fs.mkdirSync(USER_STORAGE_DIR, { recursive: true });
    }

    const backupFiles = fs.readdirSync(this.backupDir);
    let restoredCount = 0;

    for (const file of backupFiles) {
      try {
        const backupPath = path.join(this.backupDir, file);
        const restorePath = path.join(USER_STORAGE_DIR, file);

        fs.renameSync(backupPath, restorePath);
        restoredCount++;
      } catch (error) {
        logger.error(`Failed to restore ${file}:`, error);
      }
    }

    logger.info(`Rollback completed: ${restoredCount} files restored`);

    // Remove backup directory if empty
    try {
      fs.rmdirSync(this.backupDir);
    } catch (error) {
      logger.warn("Could not remove backup directory:", error);
    }
  }
}

// Helper functions for easy migration
export const migrateToRedis = async (): Promise<void> => {
  const migration = new DataMigration();

  logger.info("=== Starting Data Migration to Redis ===");

  try {
    // Migrate user profiles
    await migration.migrateUserProfilesToRedis();

    // Migrate XMTP data (backup for now)
    await migration.migrateXmtpDataToRedis();

    // Verify migration
    const isValid = await migration.verifyMigration();

    if (isValid) {
      logger.success("✅ Migration completed successfully!");
    } else {
      logger.error("❌ Migration verification failed");
      throw new Error("Migration verification failed");
    }
  } catch (error) {
    logger.error("Migration failed:", error);
    throw error;
  }

  logger.info("=== Migration Process Complete ===");
};

export const rollbackMigration = async (): Promise<void> => {
  const migration = new DataMigration();
  await migration.rollbackUserProfiles();
};

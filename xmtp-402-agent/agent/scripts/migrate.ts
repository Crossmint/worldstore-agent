#!/usr/bin/env tsx

import { migrateToRedis, rollbackMigration } from "../helpers/migration";
import { logger } from "../helpers/logger";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "migrate":
      logger.info("Starting migration to Redis...");
      try {
        await migrateToRedis();
        logger.success("Migration completed successfully!");
        process.exit(0);
      } catch (error) {
        logger.error("Migration failed:", error);
        process.exit(1);
      }
      break;

    case "rollback":
      logger.info("Rolling back migration...");
      try {
        await rollbackMigration();
        logger.success("Rollback completed successfully!");
        process.exit(0);
      } catch (error) {
        logger.error("Rollback failed:", error);
        process.exit(1);
      }
      break;

    default:
      console.log(`
Usage: tsx scripts/migrate.ts <command>

Commands:
  migrate   - Migrate filesystem data to Redis
  rollback  - Rollback Redis migration to filesystem

Examples:
  tsx scripts/migrate.ts migrate
  tsx scripts/migrate.ts rollback
      `);
      process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Migration script error:", error);
  process.exit(1);
});

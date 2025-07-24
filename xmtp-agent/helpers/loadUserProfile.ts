import { UserProfile } from "lib/types";
import fs from "node:fs";
import { USER_STORAGE_DIR } from "./constants";

export const loadUserProfile = (inboxId: string): UserProfile | null => {
  const filePath = `${USER_STORAGE_DIR}/${inboxId}.json`;
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

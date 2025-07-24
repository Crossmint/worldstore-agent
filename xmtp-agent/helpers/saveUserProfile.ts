import { UserProfile } from "../lib/types";
import fs from "node:fs";
import { USER_STORAGE_DIR } from "./constants";

export const saveUserProfile = (profile: UserProfile): void => {
  const filePath = `${USER_STORAGE_DIR}/${profile.inboxId}.json`;
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
};

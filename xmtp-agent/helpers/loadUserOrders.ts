import { UserProfile } from "lib/types";
import fs from "node:fs";
import { USER_STORAGE_DIR } from "./constants";

export const loadUserOrders = (
  inboxId: string
): UserProfile["orderHistory"] => {
  const filePath = `${USER_STORAGE_DIR}/${inboxId}.json`;
  if (!fs.existsSync(filePath)) return [];
  const userData = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return userData.orderHistory || [];
};

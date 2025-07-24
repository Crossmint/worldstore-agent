import { UserProfile } from "lib/types";
import { loadUserOrders as redisLoadUserOrders } from "./redis";

export const loadUserOrders = async (
  inboxId: string
): Promise<UserProfile["orderHistory"]> => {
  return redisLoadUserOrders(inboxId);
};

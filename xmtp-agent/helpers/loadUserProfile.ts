import { UserProfile } from "lib/types";
import { loadUserProfile as redisLoadUserProfile } from "./redis";

export const loadUserProfile = async (inboxId: string): Promise<UserProfile | null> => {
  return redisLoadUserProfile(inboxId);
};

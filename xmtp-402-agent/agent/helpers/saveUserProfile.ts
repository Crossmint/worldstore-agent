import { UserProfile } from "../lib/types";
import { saveUserProfile as redisSaveUserProfile } from "./redis";

export const saveUserProfile = async (profile: UserProfile): Promise<void> => {
  return redisSaveUserProfile(profile);
};

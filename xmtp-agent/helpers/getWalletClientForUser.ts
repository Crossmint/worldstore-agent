import { generateUserPrivateKey } from "./generateUserPrivateKey";
import { createUserWallet } from "./wallet";

export const getWalletClientForUser = (inboxId: string) => {
  const userPrivateKey = generateUserPrivateKey(inboxId);
  const userWallet = createUserWallet(userPrivateKey);

  return userWallet;
};

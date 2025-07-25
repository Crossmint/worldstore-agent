import { UserProfile } from "@lib/types";
import { getUserOnchainTools } from "./onchain";
import { editProfileTool, readProfileTool } from "./profile";
import { searchProductTool } from "./product";
import { getOrderStatusTool, getUserOrderHistoryTool } from "./order";

export const getTools = async (userProfile: UserProfile | null | undefined) => {
  const walletTools = userProfile ? await getUserOnchainTools(userProfile) : [];
  const tools = [
    editProfileTool(),
    readProfileTool(),
    // orderProductTool(),
    searchProductTool(),
    getUserOrderHistoryTool(),
    getOrderStatusTool(),
    ...walletTools,
  ];
  return tools;
};

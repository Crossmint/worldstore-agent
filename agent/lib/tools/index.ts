import { UserProfile } from "@lib/types";
import { getUserOnchainTools } from "./onchain";
import { editProfileTool, readProfileTool, deleteProfileTool } from "./profile";
import { searchProductTool } from "./order";
import { getOrderStatusTool, getUserOrderHistoryTool } from "./order";

export const getTools = async (userProfile: UserProfile | null | undefined) => {
  const walletTools = userProfile ? await getUserOnchainTools(userProfile) : [];
  const tools = [
    editProfileTool(),
    readProfileTool(),
    deleteProfileTool(),
    // orderProductTool(),
    searchProductTool(),
    getUserOrderHistoryTool(),
    getOrderStatusTool(),
    ...walletTools,
  ];
  return tools;
};

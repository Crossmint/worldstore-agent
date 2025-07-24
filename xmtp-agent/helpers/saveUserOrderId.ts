import { Order, UserProfile } from "../lib/types";
import fs from "node:fs";
import { USER_STORAGE_DIR } from "./constants";

export const saveUserOrderId = ({
  profile,
  order,
}: {
  profile: UserProfile;
  order: Order;
}): void => {
  const userFilePath = `${USER_STORAGE_DIR}/${profile.inboxId}.json`;
  const userData = JSON.parse(fs.readFileSync(userFilePath, "utf8"));
  const userOrders = userData.orderHistory
    ? [...userData.orderHistory, order]
    : [order];
  fs.writeFileSync(
    userFilePath,
    JSON.stringify({ ...userData, orderHistory: userOrders }, null, 2)
  );
};

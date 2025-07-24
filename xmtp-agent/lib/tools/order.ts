import { logger } from "@helpers/logger";
import {
  DynamicStructuredTool,
  type StructuredToolInterface,
} from "@langchain/core/tools";
import { z } from "zod";
import { WORLDSTORE_API_URL } from "@helpers/constants";
import { orderStatusToolSchema, readProfileToolSchema } from "../types";
import { loadUserOrders } from "@helpers/loadUserOrders";
// @ts-ignore - Using Node.js 18+ global fetch
declare const fetch: any;

export const getUserOrderHistoryTool = (): StructuredToolInterface => {
  return new DynamicStructuredTool({
    name: "get_user_order_history",
    description: `Get the user's complete order history.

Use this tool to:
- Show all past orders for the user
- Display order details including ASIN, order ID, and date
- Help users track their purchase history
- Provide order information for support inquiries

This tool reads the actual order history from storage and formats it for display.`,
    schema: readProfileToolSchema,
    func: async ({ userInboxId }: z.infer<typeof readProfileToolSchema>) => {
      try {
        const orderHistory = loadUserOrders(userInboxId);

        if (!orderHistory || orderHistory.length === 0) {
          return `📦 Order History

No orders found for this user.

Status: No previous purchases
Next step: Use search_product to find items to purchase, then use order_product to place orders.`;
        }

        // Sort orders by date (newest first)
        const sortedOrders = orderHistory.sort(
          (a, b) =>
            new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()
        );

        let historyText = `📦 Order History (${orderHistory.length} order${orderHistory.length === 1 ? "" : "s"})\n\n`;

        sortedOrders.forEach((order, index) => {
          const orderDate = new Date(order.orderDate).toLocaleDateString(
            "en-US",
            {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }
          );

          historyText += `${index + 1}. Order #${order.orderId}\n`;
          historyText += `   📅 Date: ${orderDate}\n`;
          historyText += `   🛍️ ASIN: ${order.asin}\n`;
          historyText += `   🔗 Amazon: https://amazon.com/dp/${order.asin}\n\n`;
        });

        logger.success("Order history retrieved successfully", {
          userInboxId,
          orderCount: orderHistory.length,
        });

        return historyText.trim();
      } catch (error) {
        logger.error("Error loading order history", error);
        return "❌ Error loading order history. Please try again.";
      }
    },
  });
};
export const getOrderStatusTool = (): StructuredToolInterface => {
  return new DynamicStructuredTool({
    name: "get_order_status",
    description: `Check the status of a specific order using its order ID.

Use this tool to:
- Check the current status of an order
- Get detailed order information
- Track shipping status
- Verify order completion

Provide the order ID that was returned when the order was placed.`,
    schema: orderStatusToolSchema,
    func: async ({ orderId }: z.infer<typeof orderStatusToolSchema>) => {
      try {
        logger.tool("get_order_status", "Checking order status", { orderId });

        const statusUrl = `${WORLDSTORE_API_URL}/api/orders/${orderId}/status`;

        logger.tool("get_order_status", "Making GET request", { statusUrl });

        const response = await fetch(statusUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            logger.warn("Order not found", {
              orderId,
              status: response.status,
            });
            return `❌ Order not found. Order ID "${orderId}" does not exist or may be invalid.`;
          }

          logger.error("Order status request failed", {
            orderId,
            status: response.status,
            statusText: response.statusText,
          });
          return `❌ Failed to check order status. Status: ${response.status} ${response.statusText}`;
        }

        const orderData = await response.json();
        logger.success("Order status formatted successfully", { orderId });
        return orderData;
      } catch (error) {
        logger.error("Error checking order status", { orderId, error });
        return `❌ Error checking order status for order #${orderId}. Please try again or contact support.`;
      }
    },
  });
};

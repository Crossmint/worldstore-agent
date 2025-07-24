import { logger } from "@helpers/logger";
import {
  DynamicStructuredTool,
  type StructuredToolInterface,
} from "@langchain/core/tools";
import { z } from "zod";
import { loadUserProfile } from "@helpers/loadUserProfile";
import { WORLDSTORE_API_URL } from "@helpers/constants";
import { getWalletClientForUser } from "@helpers/getWalletClientForUser";
import { randomBytes } from "crypto";
import {
  InsufficientFundsError,
  orderProductToolSchema,
  searchProductToolSchema,
} from "../types";
import { saveUserOrderId } from "@helpers/saveUserOrderId";
import { getJson } from "serpapi";
import { validateEnvironment } from "@helpers/client";
import { USDCHandler } from "@helpers/usdc";

// @ts-ignore - Using Node.js 18+ global fetch
declare const fetch: any;

const { SERPAPI_API_KEY } = validateEnvironment(["SERPAPI_API_KEY"]);

export const orderProductTool = (): StructuredToolInterface => {
  return new DynamicStructuredTool({
    name: "order_product",
    description: `Order Amazon products for users with complete profiles. Use this tool for purchase requests and standalone ASINs.

🎯 WHEN TO USE THIS TOOL:
- User sends JUST an ASIN: "B078GDLCT5" (This means they want to buy it!)
- User says "I want to buy [ASIN]"
- User says "Purchase [ASIN] for me"
- User says "Order [ASIN]"
- Any valid 10-character Amazon ASIN with purchase intent

🚫 WHEN NOT TO USE:
- Profile is incomplete (missing name, email, or address)
- User is asking about products without purchase intent
- User is updating profile information
- No valid ASIN in the request

✅ ASIN RECOGNITION:
- Exactly 10 characters long
- Numeric: "1953953557" or Alphanumeric: "B08N5WRWNW"
- Standalone ASIN = Purchase request (user wants to buy it)
- Examples: "B078GDLCT5", "1953953557", "B08N5WRWNW"

🔥 CRITICAL: If user sends a standalone ASIN like "B078GDLCT5", they want to purchase it - use this tool!

WHAT THIS TOOL DOES:
- Validates user profile is complete
- Creates Amazon order via Crossmint API
- Processes USDC payment on Base network
- Returns order confirmation or error messages

CRITICAL: Only call when user explicitly requests to purchase a specific ASIN.`,
    schema: orderProductToolSchema,
    func: async ({
      userInboxId,
      asin,
    }: z.infer<typeof orderProductToolSchema>) => {
      console.log("Tool input:", { userInboxId, asin });
      const orderServerUrl = WORLDSTORE_API_URL;
      try {
        logger.tool("order_product", "Starting order process", {
          userInboxId,
          asin,
        });

        // Load user profile
        const userProfile = await loadUserProfile(userInboxId);
        if (!userProfile || !userProfile.isComplete) {
          return "❌ Your profile must be complete before ordering. Please provide your name, email, and shipping address first.";
        }

        if (
          !userProfile.email ||
          !userProfile.shippingAddress ||
          !userProfile.name
        ) {
          return "❌ Missing required profile information. Please complete your profile with email and shipping address.";
        }

        // Use structured shipping address directly
        const physicalAddress = {
          name: userProfile.name,
          line1: userProfile.shippingAddress.line1,
          line2: userProfile.shippingAddress.line2,
          city: userProfile.shippingAddress.city,
          state: userProfile.shippingAddress.state,
          postalCode: userProfile.shippingAddress.postalCode,
          country: userProfile.shippingAddress.country,
        };

        const orderData = {
          productLocator: `amazon:${asin}`,
          email: userProfile.email,
          physicalAddress,
          payment: {
            method: "base-sepolia", // Default chain
            currency: "USDC",
          },
        };

        logger.tool("order_product", "Making initial order request", {
          orderData,
        });

        // Step 1: Initial request (should return 402 Payment Required)
        const initialResponse = await fetch(`${orderServerUrl}/api/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(orderData),
        });

        if (initialResponse.status === 402) {
          logger.tool(
            "order_product",
            "Received 402, processing payment requirement"
          );

          // Get payment requirements from response
          const fullResponse = await initialResponse.json();
          const paymentRequirements = fullResponse.accepts[0];

          logger.tool("order_product", "full response", { fullResponse });

          const userWallet = getWalletClientForUser(userProfile.inboxId);

          const contractName = "USDC";
          const contractVersion = "2";

          const domain = {
            name: contractName,
            version: contractVersion,
            chainId: 84532,
            verifyingContract: paymentRequirements.asset,
          };
          // EIP-712 types for USDC transferWithAuthorization
          const types = {
            TransferWithAuthorization: [
              { name: "from", type: "address" },
              { name: "to", type: "address" },
              { name: "value", type: "uint256" },
              { name: "validAfter", type: "uint256" },
              { name: "validBefore", type: "uint256" },
              { name: "nonce", type: "bytes32" },
            ],
          };
          const now = Math.floor(Date.now() / 1000);
          const authorization = {
            from: userWallet.account.address,
            to: paymentRequirements.asset,
            value: BigInt(paymentRequirements.maxAmountRequired),
            validAfter: BigInt(0),
            validBefore: BigInt(
              now + (paymentRequirements.maxTimeoutSeconds || 3600)
            ),
            nonce: `0x${randomBytes(32).toString("hex")}`,
          };

          // check balance before signing data for transaction
          const usdcHandler = new USDCHandler("base-sepolia");
          const currentBalance = parseFloat(
            await usdcHandler.getUSDCBalance(userWallet.account.address)
          );
          const requiredAmount =
            parseInt(paymentRequirements.maxAmountRequired) / Math.pow(10, 6);

          console.log({ currentBalance, requiredAmount });

          if (currentBalance < requiredAmount) {
            console.log({
              shortfall: Math.floor(
                (requiredAmount - currentBalance) * Math.pow(10, 6)
              ).toString(),
              recipientAddress: paymentRequirements.asset,
              walletAddress: userWallet.account.address,
              current: currentBalance.toFixed(6),
              required: requiredAmount.toFixed(6),
              asin,
            });
            throw new InsufficientFundsError({
              shortfall: Math.floor(
                (requiredAmount - currentBalance) * Math.pow(10, 6)
              ).toString(),
              recipientAddress: paymentRequirements.asset,
              walletAddress: userWallet.account.address,
              current: currentBalance.toFixed(6),
              required: requiredAmount.toFixed(6),
              asin,
            });
          }

          const signature = await userWallet.signTypedData({
            domain,
            types,
            primaryType: "TransferWithAuthorization",
            message: authorization,
          });

          logger.tool("order_product", "Signature", { signature });

          const paymentPayload = {
            x402Version: 1,
            scheme: paymentRequirements.scheme,
            network: paymentRequirements.network,
            payload: {
              signature,
              authorization: {
                from: userWallet.account.address,
                to: paymentRequirements.asset,
                value: BigInt(paymentRequirements.maxAmountRequired).toString(),
                validAfter: BigInt(0).toString(),
                validBefore: BigInt(
                  now + (paymentRequirements.maxTimeoutSeconds || 3600)
                ).toString(),
                nonce: `0x${randomBytes(32).toString("hex")}`,
              },
            },
            extra: {
              orderId: paymentRequirements.extra?.orderId,
            },
          };

          logger.tool("order_product", "Payment payload", { paymentPayload });

          const encodedPayment = Buffer.from(
            JSON.stringify(paymentPayload)
          ).toString("base64");

          logger.tool("order_product", "Encoded payment", { encodedPayment });

          // Step 2: Retry with payment header
          const paymentResponse = await fetch(`${orderServerUrl}/api/orders`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-PAYMENT": encodedPayment,
            },
            body: JSON.stringify(orderData),
          });

          const response = await paymentResponse.json();
          logger.tool("order_product", "Payment response", { response });

          // Return formatted string response instead of raw JSON to prevent LLM confusion
          if (paymentResponse.ok) {
            logger.success("Order created successfully", { response });
            await saveUserOrderId({
              profile: userProfile,
              order: {
                asin,
                orderId: response.order.orderId,
                orderDate: new Date().toISOString(),
              },
            });
            return `🎉 Order placed successfully!\n\nOrder Details:\n- ASIN: ${asin}\n- Order ID: ${response.order.orderId || "N/A"}\n- Status: ${response.status || "Processing"}\n- Total: ${response.total || "N/A"}\n\nYour order will be shipped to:\n${userProfile.name}\n${userProfile.shippingAddress.line1}, ${userProfile.shippingAddress.city}, ${userProfile.shippingAddress.state} ${userProfile.shippingAddress.postalCode}\n\nYou should receive a confirmation email (if not received already) at: ${userProfile.email}. Here's your order id, make sure to keep it safe: ${response.order.orderId}`;
          } else {
            logger.error("Payment request failed", {
              status: paymentResponse.status,
              response,
            });
            return `❌ Payment failed. Status: ${paymentResponse.status}. Please try again or contact support.`;
          }
        } else if (initialResponse.ok) {
          // Unexpected success without payment (shouldn't happen with x402)
          const orderResult = await initialResponse.json();
          logger.warn("Order succeeded without payment requirement", {
            orderResult,
          });
          return `✅ Order placed (no payment required)!\n\nOrder Details:\n- ASIN: ${asin}\n- Order ID: ${orderResult.orderId || "N/A"}`;
        } else {
          const errorData = await initialResponse.text();
          logger.error("Initial order request failed", {
            status: initialResponse.status,
            errorData,
          });
          return `❌ Order failed. Status: ${initialResponse.status}. Please check the ASIN and try again.`;
        }
      } catch (error) {
        console.log("caught error");
        if (error instanceof InsufficientFundsError) {
          console.log("catching here", error);
          throw error;
        }
        console.log("nono catching here");
        logger.error("Error processing order", error);
        return "❌ Sorry, there was an error processing your order. Please try again.";
      }
    },
  });
};

export const searchProductTool = (): StructuredToolInterface => {
  return new DynamicStructuredTool({
    name: "search_product",
    description: `Search for products on Amazon.com. Use this tool to search for products on Amazon.com.
    IMPORTANT: Always return the "url" separately as a text string along with all other product details.`,
    schema: searchProductToolSchema,
    func: async ({ query }: z.infer<typeof searchProductToolSchema>) => {
      const response = await getJson({
        engine: "amazon",
        k: query,
        amazon_domain: "amazon.com",
        api_key: SERPAPI_API_KEY,
      });
      const items = response.organic_results
        .map(
          ({
            asin,
            title,
            link_clean,
            rating,
            reviews,
            extracted_price,
          }: {
            asin: string;
            title: string;
            link_clean: string;
            rating: number;
            reviews: number;
            extracted_price: number;
          }) => {
            return {
              asin,
              title,
              url: link_clean,
              rating,
              reviews,
              extracted_price,
            };
          }
        )
        .slice(0, 5);
      console.log({ items });
      return JSON.stringify(items);
    },
  });
};

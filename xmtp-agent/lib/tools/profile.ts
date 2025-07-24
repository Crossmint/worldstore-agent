import { logger } from "@helpers/logger";
import {
  DynamicStructuredTool,
  type StructuredToolInterface,
} from "@langchain/core/tools";
import { z } from "zod";
import { loadUserProfile } from "@helpers/loadUserProfile";
import { getMissingProfileFields } from "@helpers/getMissingProfileFields";
import { saveUserProfile } from "@helpers/saveUserProfile";
import { getWalletClientForUser } from "@helpers/getWalletClientForUser";
import { readProfileToolSchema, profileToolSchema } from "../types";

export const editProfileTool = (): StructuredToolInterface => {
  return new DynamicStructuredTool({
    name: "edit_profile",
    description: `🚨 PROFILE EDITING TOOL - ALMOST NEVER USE WHEN PROFILE IS COMPLETE 🚨

🚫 ABSOLUTE PROHIBITIONS - DO NOT USE FOR:
- ANY ASIN codes: "B078GDLCT5", "1953953557", etc. (These are PURCHASE requests!)
- Purchase requests: "I want to buy", "Purchase", "Order"
- When profile is COMPLETE and user is shopping
- General conversation or greetings
- Product inquiries or shopping activities

⛔ SPECIAL PROHIBITION - NEVER USE FOR STANDALONE ASINs:
- "B078GDLCT5" → This is a PURCHASE REQUEST → Use order_product tool
- "1953953557" → This is a PURCHASE REQUEST → Use order_product tool
- Any 10-character alphanumeric code → PURCHASE REQUEST

✅ ONLY USE IF USER EXPLICITLY SAYS THESE EXACT WORDS:
- "Update my address to [new address]"
- "Change my email to [new email]"
- "Modify my profile"
- "Edit my information"
- "I want to change my [field]"

🚫 NEVER USE FOR:
- "B078GDLCT5" → Use order_product tool instead
- "I want to buy..." → Use order_product tool instead
- Shopping or purchase activities → Use order_product tool instead

For addresses, parse into structured shippingAddress format:
- line1: street address (e.g., "123 Main St")
- line2: apt/unit (leave empty string "" if not provided)
- city: city name (e.g., "New York")
- state: state abbreviation (e.g., "NY")
- postalCode: ZIP code (e.g., "10001")
- country: "US" (2-letter ISO code - only USA addresses supported)

🔥 CRITICAL: This tool should ALMOST NEVER be used when profile is complete. Only for explicit profile change requests.`,
    schema: profileToolSchema,
    func: async ({
      userInboxId,
      name,
      email,
      shippingAddress,
    }: z.infer<typeof profileToolSchema>) => {
      try {
        logger.tool("edit_profile", "Editing profile", { userInboxId });

        // Load or create current profile
        let currentProfile = await loadUserProfile(userInboxId);
        if (!currentProfile) {
          logger.profile("Creating new profile", { userInboxId });
          currentProfile = {
            inboxId: userInboxId,
            name: "",
            email: "",
            shippingAddress: {
              line1: "",
              line2: "",
              city: "",
              state: "",
              postalCode: "",
              country: "",
            },
            isComplete: false,
            orderHistory: [],
          };
        }

        // If no explicit parameters provided, return guidance
        if (!name && !email && !shippingAddress) {
          logger.warn("No parameters provided to edit_profile tool");
          return `I need you to specify what to update. For example:
- To set name: call with name parameter
- To set email: call with email parameter
- To set address: call with shippingAddress parameter (structured object)`;
        }

        const changes: string[] = [];

        if (name) {
          const oldName = currentProfile.name;
          currentProfile.name = name.trim();
          changes.push(`name: "${oldName}" → "${currentProfile.name}"`);
          logger.profile("Updated name", { newName: currentProfile.name });
        }

        if (email) {
          const oldEmail = currentProfile.email;
          currentProfile.email = email.trim();
          changes.push(`email: "${oldEmail}" → "${currentProfile.email}"`);
          logger.profile("Updated email", { newEmail: currentProfile.email });
        }

        if (shippingAddress) {
          const oldAddress = `${currentProfile.shippingAddress.line1}, ${currentProfile.shippingAddress.city}, ${currentProfile.shippingAddress.state} ${currentProfile.shippingAddress.postalCode}`;
          currentProfile.shippingAddress = {
            line1: shippingAddress.line1,
            line2: shippingAddress.line2,
            city: shippingAddress.city,
            state: shippingAddress.state,
            postalCode: shippingAddress.postalCode,
            country: shippingAddress.country,
          };
          const newAddress = `${shippingAddress.line1}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.postalCode}`;
          changes.push(`shipping: "${oldAddress}" → "${newAddress}"`);
          logger.profile("Updated shipping address", {
            newAddress: shippingAddress,
          });
        }

        if (changes.length === 0) {
          const address = currentProfile.shippingAddress;
          const addressInfo = address.line1
            ? `${address.line1}${address.line2 ? ` ${address.line2}` : ""}, ${address.city}, ${address.state} ${address.postalCode}`
            : "Not set";
          return `Current profile: Name: ${currentProfile.name}, Email: ${currentProfile.email}, Shipping: ${addressInfo}`;
        }

        const missing = getMissingProfileFields(currentProfile);
        currentProfile.isComplete = missing.length === 0;

        // Generate deterministic wallet if profile is complete and wallet doesn't exist
        if (currentProfile.isComplete && !currentProfile.walletAddress) {
          const userWallet = getWalletClientForUser(currentProfile.inboxId);
          currentProfile.walletAddress = userWallet.account.address;
          logger.profile("Generated deterministic wallet", {
            walletAddress: currentProfile.walletAddress,
          });
        }

        await saveUserProfile(currentProfile);
        logger.profile("Profile saved", { userInboxId });

        logger.success("Profile updated successfully", { userInboxId });

        const address = currentProfile.shippingAddress;
        const addressDetails = address.line1
          ? `${address.line1}${address.line2 ? ` ${address.line2}` : ""}, ${address.city}, ${address.state} ${address.postalCode}`
          : "Not set";

        const result = `✅ Profile updated successfully!\n\nChanges made:\n${changes.join("\n")}\n\nUpdated profile:\n- Name: ${currentProfile.name}\n- Email: ${currentProfile.email}\n- Shipping: ${addressDetails}\n- Wallet: ${currentProfile.walletAddress || "Not created"}`;

        if (currentProfile.isComplete) {
          return `${result}\n\n🎉 Profile is now complete! You can start shopping!`;
        } else {
          const stillMissing = getMissingProfileFields(currentProfile);
          return `${result}\n\nStill missing: ${stillMissing.join(", ")}`;
        }
      } catch (error) {
        logger.error("Error updating profile", error);
        return "❌ Error updating profile. Please try again.";
      }
    },
  });
};

export const readProfileTool = (): StructuredToolInterface => {
  return new DynamicStructuredTool({
    name: "read_profile",
    description: `Read current user profile information from storage.

Use this tool to:
- Check what profile information is currently saved
- See what fields are missing
- Get up-to-date profile status before making decisions
- Avoid hallucinating about user information

This tool always returns the actual saved profile data, never assumptions.`,
    schema: readProfileToolSchema,
    func: async ({ userInboxId }: z.infer<typeof readProfileToolSchema>) => {
      try {
        logger.tool("read_profile", "Reading profile", { userInboxId });

        const currentProfile = await loadUserProfile(userInboxId);

        if (!currentProfile) {
          return `❌ No profile exists for this user.

Status: New user
Next step: Use edit_profile tool to create profile with name, email, and shipping address.`;
        }

        const missing = getMissingProfileFields(currentProfile);
        const address = currentProfile.shippingAddress;
        const addressDetails = address?.line1
          ? `${address.line1}${address.line2 ? ` ${address.line2}` : ""}, ${address.city}, ${address.state} ${address.postalCode}, ${address.country || "US"}`
          : "Not set";

        const profileStatus = currentProfile.isComplete
          ? "✅ COMPLETE"
          : "❌ INCOMPLETE";

        return `📋 Current Profile Status: ${profileStatus}

📝 Saved Information:
- Name: ${currentProfile.name || "Not set"}
- Email: ${currentProfile.email || "Not set"}
- Shipping Address: ${addressDetails}
- Wallet Address: ${currentProfile.walletAddress || "Not created"}

${missing.length > 0 ? `🚨 Missing Fields: ${missing.join(", ")}` : "🎉 Profile is complete - user can shop!"}

Profile ID: ${currentProfile.inboxId}`;
      } catch (error) {
        logger.error("Error reading profile", error);
        return "❌ Error reading profile. Please try again.";
      }
    },
  });
};

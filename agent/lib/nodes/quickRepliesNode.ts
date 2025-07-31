import { ChatAnthropic } from "@langchain/anthropic";
import { logger } from "@helpers/logger";
import { AgentState } from "@lib/types";

export const createQuickRepliesNode = (llm: ChatAnthropic) => {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    logger.agent("💬 Quick replies node processing", {
      userInboxId: state.userInboxId,
      messageCount: state.messages.length,
    });

    try {
      // Get last 4 messages for context
      const lastFourMessages = state.messages.slice(-4);

      // Create prompt for quick replies prediction
      const quickRepliesPrompt = `Based on the following conversation context, generate up to 2 short, relevant quick reply options that the user might want to send next.

Requirements for each quick reply:
- Maximum 15 characters for the label
- Natural and conversational
- Relevant to the current conversation context
- Actionable and helpful for the user

Recent conversation context:
${lastFourMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Return ONLY a JSON array with objects containing "label" and "value" fields, where:
- "label" is the short text shown on the button (max 15 chars)
- "value" is the full message that will be sent when clicked

Example format:
[
  {"label": "Tell me more", "value": "Can you tell me more about this?"},
  {"label": "Check profile", "value": "Show my profile"},
]`;

      const response = await llm.invoke([
        { role: "user", content: quickRepliesPrompt }
      ]);

      // Parse the response to extract quick replies
      const content = response.content as string;
      let quickReplies;

      try {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          quickReplies = JSON.parse(jsonMatch[0]);
        } else {
          quickReplies = JSON.parse(content.trim());
        }

        // Validate and limit to 4 replies
        if (Array.isArray(quickReplies)) {
          quickReplies = quickReplies
            .slice(0, 4)
            .filter(reply => reply.label && reply.value)
            .map(reply => ({
              label: String(reply.label).substring(0, 30),
              value: String(reply.value)
            }));
        } else {
          throw new Error("Response is not an array");
        }
      } catch (parseError) {
        throw new Error(`Failed to parse quick replies: ${parseError}`);
      }

      return {
        quickReplies
      };
    } catch (error) {
      logger.error("Quick replies generation error", {
        error: error instanceof Error ? error.message : String(error),
        userInboxId: state.userInboxId,
      });

      // Return contextual default quick replies on error
      const defaultReplies = [
        { label: "Help", value: "/help" },
        { label: "Thanks", value: "Thank you!" }
      ];

      // Add shopping option if user isn't already shopping
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage && !lastMessage.content.includes("🧙‍♀️")) {
        defaultReplies.unshift({ label: "Shop now", value: "I want to shop for something" });
      }

      return {
        quickReplies: defaultReplies.slice(0, 4)
      };
    }
  };
};
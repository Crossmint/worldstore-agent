import { WAITING_MESSAGE } from "./constants";

export const toShowMenu = (
  messageContent: string,
  conversationHistory: any[]
): boolean => {
  // Check if this is a /help or /menu command
  const isMenuCommand =
    messageContent.trim().toLowerCase() === "/help" ||
    messageContent.trim().toLowerCase() === "/menu";

  const meaningfulMessages = conversationHistory
    .filter((msg) => msg.content !== WAITING_MESSAGE)
    .filter((msg) => msg.contentType?.typeId === "text");

  const isFirstInteraction = meaningfulMessages.length <= 1;

  // Check if the time difference between the last two messages is more than 3 hours
  const isLongTimeSinceLastMessage =
    meaningfulMessages.length >= 2 &&
    (() => {
      const lastMessage = meaningfulMessages[meaningfulMessages.length - 1];
      const secondLastMessage =
        meaningfulMessages[meaningfulMessages.length - 2];

      // Try common timestamp property names used in XMTP messages
      const lastMessageTime =
        (lastMessage as any).sentAt ||
        (lastMessage as any).sent ||
        (lastMessage as any).timestamp ||
        (lastMessage as any).createdAt;
      const secondLastMessageTime =
        (secondLastMessage as any).sentAt ||
        (secondLastMessage as any).sent ||
        (secondLastMessage as any).timestamp ||
        (secondLastMessage as any).createdAt;

      if (lastMessageTime && secondLastMessageTime) {
        const timeDiff = Math.abs(
          new Date(lastMessageTime).getTime() -
            new Date(secondLastMessageTime).getTime()
        );
        const threeHoursInMs = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
        return timeDiff > threeHoursInMs;
      }

      return false;
    })();

  return isMenuCommand || isFirstInteraction || isLongTimeSinceLastMessage;
};

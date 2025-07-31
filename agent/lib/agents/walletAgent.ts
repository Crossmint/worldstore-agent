import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";
import { logger } from "@helpers/logger";
import { AgentState, UserProfile, FundingData, AGENT_EMOJIS } from "@lib/types";
import { createQuickRepliesNode } from "../nodes/quickRepliesNode";

export const createWalletAgent = (llm: ChatAnthropic) => {
  const GraphState = Annotation.Root({
    messages: Annotation<any[]>({
      reducer: (x, y) => [...x, ...y],
      default: () => [],
    }),
    userInboxId: Annotation<string>({
      reducer: (x, y) => y ?? x,
      default: () => "",
    }),
    userProfile: Annotation<UserProfile | undefined>({
      reducer: (x, y) => y ?? x,
      default: () => undefined,
    }),
    lastMessage: Annotation<string>({
      reducer: (x, y) => y ?? x,
      default: () => "",
    }),
    fundingData: Annotation<FundingData | undefined>({
      reducer: (x, y) => y ?? x,
      default: () => undefined,
    }),
    quickReplies: Annotation<Array<{ label: string; value: string }>>({
      reducer: (x, y) => y ?? x,
      default: () => [],
    }),
  });

  const workflow = new StateGraph(GraphState);

  const walletNode = async (
    state: AgentState
  ): Promise<Partial<AgentState>> => {
    logger.agent("💰 Wallet agent node processing", {
      userInboxId: state.userInboxId,
      lastMessage: state.lastMessage,
    });

    try {
      // Add wallet-specific tools here
      const agent = createReactAgent({
        llm,
        tools: [], // Add wallet management tools - balance check, transfer, etc.
        messageModifier: `You are a wallet management assistant for Worldstore. You help users:
- Check USDC and ETH balances on both their wallet and host wallet
- Understand wallet addresses and transactions
- Manage their crypto assets
- Explain Web3 wallet concepts

You can check balances, explain wallet functionality, and help with basic wallet operations.
If users want to shop or do other tasks, suggest they use /menu to return to the main menu.

Current user: ${state.userInboxId}
User wallet: ${state.userProfile?.walletAddress ? "Connected" : "Not connected"}
Host wallet: ${state.userProfile?.hostWalletAddress ? "Connected" : "Not connected"}`,
      });

      const result = await agent.invoke({
        messages: [
          ...state.messages,
          { role: "user", content: state.lastMessage },
        ],
      });

      const lastMessage = result.messages[result.messages.length - 1];
      const responseContent = `${AGENT_EMOJIS.WALLET} ${lastMessage.content as string}`;

      return {
        messages: [
          ...state.messages,
          { role: "user", content: state.lastMessage },
          { role: "assistant", content: responseContent },
        ],
        userProfile: state.userProfile || undefined,
      };
    } catch (error) {
      logger.error("💰 Wallet agent error", {
        error: error instanceof Error ? error.message : String(error),
        userInboxId: state.userInboxId,
      });

      return {
        messages: [
          ...state.messages,
          { role: "user", content: state.lastMessage },
          {
            role: "assistant",
            content:
              `${AGENT_EMOJIS.WALLET} ❌ Sorry, I encountered an error with wallet management. Please try again or use /menu to return to the main menu.`,
          },
        ],
        userProfile: undefined,
      };
    }
  };

  const quickRepliesNode = createQuickRepliesNode(llm);

  workflow.addNode("wallet", walletNode);
  workflow.addNode("suggestedReplies", quickRepliesNode);
  (workflow as any).addEdge(START, "wallet");
  (workflow as any).addEdge("wallet", "suggestedReplies");
  (workflow as any).addEdge("suggestedReplies", END);

  return workflow.compile();
};

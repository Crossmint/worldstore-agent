import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";
import { logger } from "@helpers/logger";
import { AgentState, UserProfile, FundingData, AGENT_EMOJIS } from "@lib/types";
// import { createQuickRepliesNode } from "@lib/nodes/quickRepliesNode";
import { generalAssistantPrompt } from "@lib/agents/general/prompt";

export const createGeneralAgent = (llm: ChatAnthropic) => {
  console.log("creating general agent");
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

  const generalNode = async (
    state: AgentState
  ): Promise<Partial<AgentState>> => {
    logger.agent("🤖 General agent node processing", {
      userInboxId: state.userInboxId,
      lastMessage: state.lastMessage,
    });

    try {
      const agent = createReactAgent({
        llm,
        tools: [], // Add general tools here - web search, info queries, etc.
        messageModifier: generalAssistantPrompt(state),
      });

      // only for observability
      const callbacks = {
        handleLLMStart: (llm: any, prompts: string[]) => {
          logger.agent("🔍 LLM Start", {
            userInboxId: state.userInboxId,
            promptCount: prompts.length,
            promptPreview: prompts[0]?.substring(0, 300),
          });
        },
        handleLLMEnd: (output: any) => {
          const responseText =
            output.generations?.[0]?.[0]?.text ||
            output.text ||
            JSON.stringify(output);
          logger.agent("🔍 LLM End", {
            userInboxId: state.userInboxId,
            responsePreview: responseText?.substring(0, 300),
            hasToolCall:
              responseText?.includes("order_product") ||
              responseText?.includes("edit_profile") ||
              responseText?.includes("Action:"),
            toolMentioned: responseText?.includes("order_product")
              ? "order_product"
              : responseText?.includes("edit_profile")
                ? "edit_profile"
                : "none",
          });
        },
        handleLLMError: (error: any) => {
          logger.agent("🔍 LLM Error", {
            userInboxId: state.userInboxId,
            error: error instanceof Error ? error.message : String(error),
          });
        },
        handleText: (text: string, runId?: string) => {
          logger.agent("📝 Agent Text", {
            userInboxId: state.userInboxId,
            text: text?.substring(0, 200),
            isThought: text?.includes("Thought:"),
            isAction: text?.includes("Action:"),
            isObservation: text?.includes("Observation:"),
            runId: runId?.substring(0, 8),
          });
        },
        handleAgentAction: (action: any, runId?: string) => {
          logger.agent("🎯 Agent Action", {
            userInboxId: state.userInboxId,
            tool: action.tool,
            toolInput: action.toolInput,
            isOrderProduct: action.tool === "order_product",
            isEditProfile: action.tool === "edit_profile",
            extractedData:
              action.tool === "order_product"
                ? action.toolInput?.asin
                : action.tool === "edit_profile"
                  ? `${action.toolInput?.name || ""}|${action.toolInput?.email || ""}`
                  : "other",
            runId: runId?.substring(0, 8),
          });
        },
        handleToolStart: (tool: any, input: string, runId?: string) => {
          logger.agent("🔧 Tool Start", {
            userInboxId: state.userInboxId,
            toolName: tool.name,
            toolInput: input,
            runId: runId?.substring(0, 8),
          });
        },
        handleToolEnd: (output: any, runId?: string) => {
          const outputStr =
            typeof output === "string" ? output : JSON.stringify(output);
          logger.agent("🔧 Tool End", {
            userInboxId: state.userInboxId,
            outputPreview: outputStr?.substring(0, 200),
            success:
              !outputStr?.includes("error") && !outputStr?.includes("Error"),
            runId: runId?.substring(0, 8),
          });
        },
        handleToolError: (error: any, runId?: string) => {
          logger.agent("🔧 Tool Error", {
            userInboxId: state.userInboxId,
            error: error instanceof Error ? error.message : String(error),
            runId: runId?.substring(0, 8),
          });
        },
        handleAgentFinish: (finish: any, runId?: string) => {
          logger.agent("🏁 Agent Finish", {
            userInboxId: state.userInboxId,
            returnValues: finish.returnValues,
            finalResponse: finish.log?.substring(0, 200),
            runId: runId?.substring(0, 8),
          });
        },
      };

      const result = await agent.invoke(
        {
          messages: [
            ...state.messages,
            { role: "user", content: state.lastMessage },
          ],
        },
        {
          callbacks: [callbacks],
          configurable: {
            recursionLimit: 10,
          },
        }
      );

      const lastMessage = result.messages[result.messages.length - 1];
      const responseContent = `${AGENT_EMOJIS.GENERAL} ${lastMessage.content as string}`;

      return {
        messages: [
          ...state.messages,
          { role: "user", content: state.lastMessage },
          { role: "assistant", content: responseContent },
        ],
        userProfile: state.userProfile || undefined,
        fundingData: state.fundingData,
      };
    } catch (error) {
      logger.error("🤖 General agent error", {
        error: error instanceof Error ? error.message : String(error),
        userInboxId: state.userInboxId,
      });

      return {
        messages: [
          ...state.messages,
          { role: "user", content: state.lastMessage },
          {
            role: "assistant",
            content: `${AGENT_EMOJIS.GENERAL} ❌ Sorry, I encountered an error. Please try again or use /menu to return to the main menu.`,
          },
        ],
        userProfile: undefined,
        fundingData: state.fundingData,
      };
    }
  };

  // const quickRepliesNode = createQuickRepliesNode(llm);

  workflow.addNode("general", generalNode);
  // workflow.addNode("suggestedReplies", quickRepliesNode);
  (workflow as any).addEdge(START, "general");
  // (workflow as any).addEdge("general", "suggestedReplies");
  // (workflow as any).addEdge("suggestedReplies", END);
  (workflow as any).addEdge("general", END);

  return workflow.compile();
};

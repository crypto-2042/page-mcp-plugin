import type { ChatMessage, Conversation } from '../shared/types.js';
import type { ExecutableTool } from './execution-catalog.js';
import type {
    OpenAIChatCompletionResponse,
    OpenAIChatMessage,
} from './mcp-openai.js';
import { runMcpConversationTurn } from './mcp-conversation-turn.js';

type OpenAiToolDefinition = {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
};

export function createMcpChatRuntime(params: {
    model: string;
    mcpClient: unknown;
    tools: any[];
    prompts: any[];
    resources: any[];
    buildExecutionCatalog: (params: any) => ExecutableTool[];
    buildOpenAiToolsFromCatalog: (tools: ExecutableTool[]) => OpenAiToolDefinition[];
    toOpenAiMessages: (messages: ChatMessage[]) => OpenAIChatMessage[];
    formatToolResult: (result: unknown, outputSchema?: unknown) => string;
    safeRuntimeMessage: <T>(context: string, payload: any) => Promise<T | undefined>;
    streamCompletion: (messages: OpenAIChatMessage[], onDelta: (delta: string) => void) => Promise<void>;
    runConversationTurn?: typeof runMcpConversationTurn;
}) {
    const runConversation = params.runConversationTurn ?? runMcpConversationTurn;

    return {
        async runPreparedTurn(input: {
            conversationMessages: ChatMessage[];
            updateConversation: (messages: ChatMessage[]) => void;
            persistConversation: (conversation: Conversation) => Promise<void>;
            baseConversation?: Conversation;
        }) {
            const executableTools = params.buildExecutionCatalog({
                mcpClient: params.mcpClient,
                tools: params.tools,
                prompts: params.prompts,
                resources: params.resources,
            });

            return runConversation({
                conversationMessages: input.conversationMessages,
                buildExecutableTools: () => executableTools,
                toOpenAiMessages: params.toOpenAiMessages,
                buildOpenAiTools: params.buildOpenAiToolsFromCatalog,
                formatToolResult: params.formatToolResult,
                callCompletions: async (messages): Promise<OpenAIChatCompletionResponse> => {
                    const openAiTools = params.buildOpenAiToolsFromCatalog(executableTools);
                    const res = await params.safeRuntimeMessage<{ data?: OpenAIChatCompletionResponse; error?: string }>('PROXY_API_CALL', {
                        type: 'PROXY_API_CALL',
                        endpoint: '/chat/completions',
                        payload: {
                            model: params.model,
                            messages,
                            stream: false,
                            ...(openAiTools.length > 0 ? { tools: openAiTools, tool_choice: 'auto' } : {}),
                        },
                    });
                    if (!res) throw new Error('Runtime unavailable');
                    if (res.error) throw new Error(res.error);
                    return res.data || {};
                },
                streamCompletion: params.streamCompletion,
                updateConversation: input.updateConversation,
                persistConversation: async (messages) => {
                    const base = input.baseConversation;
                    if (!base) {
                        return input.persistConversation({
                            id: 'conv_runtime',
                            title: 'New Chat',
                            domain: '',
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                            messages,
                        });
                    }
                    return input.persistConversation({
                        ...base,
                        messages,
                    });
                },
            });
        },
    };
}

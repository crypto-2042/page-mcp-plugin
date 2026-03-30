import type { ChatMessage } from '../shared/types.js';
import type { ExecutableTool } from './execution-catalog.js';

export type OpenAiToolDefinition = {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
};

export type OpenAIToolCall = {
    id?: string;
    type: 'function';
    function: {
        name: string;
        arguments?: string;
    };
};

export type OpenAIToolCallDelta = {
    index: number;
    id?: string;
    type?: 'function';
    function?: {
        name?: string;
        arguments?: string;
    };
};

export type OpenAIStreamEvent =
    | { type: 'text-delta'; delta: string }
    | { type: 'tool-call-delta'; toolCalls: OpenAIToolCallDelta[] };

export type OpenAIChatMessage =
    | { role: 'user' | 'assistant' | 'system'; content: string; tool_calls?: OpenAIToolCall[] }
    | { role: 'tool'; content: string; tool_call_id: string };

export type OpenAIChatCompletionResponse = {
    choices?: Array<{
        message?: {
            role?: 'assistant';
            content?: string;
            tool_calls?: OpenAIToolCall[];
        };
    }>;
};

export type OpenAIResponseMessage = {
    role?: 'assistant';
    content?: string;
    tool_calls?: OpenAIToolCall[];
};

export function buildOpenAiToolsFromCatalog(catalog: ExecutableTool[]) {
    return catalog.map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.openAiName,
            description: tool.description,
            parameters: tool.parameters,
        },
    }));
}

export function toOpenAiConversationMessages(messages: ChatMessage[]): OpenAIChatMessage[] {
    // Note: 'tool' role messages are excluded here intentionally.
    // Tool call rounds are handled within a single turn via workingMessages
    // in mcp-conversation-turn.ts. The assistant message with tool_calls is
    // NOT persisted to conversation history, so replaying orphaned tool
    // messages in subsequent turns causes API errors like
    // "No tool call found for function call output".
    return messages
        .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system')
        .map((message): OpenAIChatMessage => ({
            role: message.role as 'user' | 'assistant' | 'system',
            content: message.content,
        }));
}

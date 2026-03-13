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
    return messages
        .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system' || message.role === 'tool')
        .flatMap((message): OpenAIChatMessage[] => {
            if (message.role === 'tool') {
                if (!message.toolCallId) return [];
                return [{
                    role: 'tool',
                    content: message.content,
                    tool_call_id: message.toolCallId,
                }];
            }
            return [{
                role: message.role,
                content: message.content,
            }];
        });
}

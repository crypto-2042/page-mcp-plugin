import type { OpenAiToolDefinition, OpenAIToolCall, OpenAIToolCallDelta } from './mcp-openai.js';

export type OpenAIStreamChunkParseResult =
    | { kind: 'text'; delta: string }
    | { kind: 'tool_calls'; toolCalls: OpenAIToolCallDelta[] }
    | { kind: 'done' }
    | { kind: 'ignore' };

export function buildStreamRequestPayload(params: {
    model: string;
    messages: unknown[];
    tools?: OpenAiToolDefinition[];
    disableToolChoice?: boolean;
}) {
    return {
        model: params.model,
        messages: params.messages,
        stream: true,
        ...(params.tools && params.tools.length > 0 ? { tools: params.tools } : {}),
        ...(params.disableToolChoice && params.tools && params.tools.length > 0 ? { tool_choice: 'none' as const } : {}),
    };
}

export function parseOpenAIStreamChunk(chunk: string): OpenAIStreamChunkParseResult {
    if (!chunk) return { kind: 'ignore' };
    if (chunk === '[DONE]') return { kind: 'done' };

    const parsed = JSON.parse(chunk);
    const delta = parsed?.choices?.[0]?.delta;
    const content = delta?.content;
    if (typeof content === 'string' && content.length > 0) {
        return { kind: 'text', delta: content };
    }

    const toolCalls = delta?.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        return { kind: 'tool_calls', toolCalls };
    }

    return { kind: 'ignore' };
}

export function accumulateToolCallDeltas(deltas: OpenAIToolCallDelta[]): OpenAIToolCall[] {
    const byIndex = new Map<number, OpenAIToolCall>();

    for (const delta of deltas) {
        const existing = byIndex.get(delta.index) ?? {
            id: delta.id,
            type: 'function' as const,
            function: {
                name: delta.function?.name || '',
                arguments: '',
            },
        };

        if (delta.id) existing.id = delta.id;
        existing.type = delta.type || existing.type || 'function';
        if (delta.function?.name) {
            existing.function.name = delta.function.name;
        }
        if (typeof delta.function?.arguments === 'string') {
            existing.function.arguments = `${existing.function.arguments || ''}${delta.function.arguments}`;
        }

        byIndex.set(delta.index, existing);
    }

    return [...byIndex.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, toolCall]) => toolCall)
        .filter((toolCall) => !!toolCall.function.name);
}

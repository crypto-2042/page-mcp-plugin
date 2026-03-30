import { describe, expect, it } from 'vitest';
import { accumulateToolCallDeltas, buildStreamRequestPayload, parseOpenAIStreamChunk } from './chat-stream.js';

describe('chat-stream helpers', () => {
    it('disables tool choice during final text streaming when tools are present', () => {
        const payload = buildStreamRequestPayload({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: 'hello' }],
            tools: [{
                type: 'function',
                function: { name: 'read_title', description: 'Read title', parameters: {} },
            }],
            disableToolChoice: true,
        });

        expect(payload).toEqual(expect.objectContaining({
            stream: true,
            tool_choice: 'none',
        }));
    });

    it('detects tool calls in streaming chunks instead of treating them as text', () => {
        const result = parseOpenAIStreamChunk(JSON.stringify({
            choices: [{
                delta: {
                    tool_calls: [{
                        index: 0,
                        id: 'call_1',
                        type: 'function',
                        function: {
                            name: 'read_title',
                            arguments: '{}',
                        },
                    }],
                },
            }],
        }));

        expect(result).toEqual({
            kind: 'tool_calls',
            toolCalls: [{
                index: 0,
                id: 'call_1',
                type: 'function',
                function: {
                    name: 'read_title',
                    arguments: '{}',
                },
            }],
        });
    });

    it('accumulates partial streamed tool call deltas into executable tool calls', () => {
        const toolCalls = accumulateToolCallDeltas([
            {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'read_title', arguments: '{' },
            },
            {
                index: 0,
                function: { arguments: '"selector":"h1"' },
            },
            {
                index: 0,
                function: { arguments: '}' },
            },
        ]);

        expect(toolCalls).toEqual([{
            id: 'call_1',
            type: 'function',
            function: {
                name: 'read_title',
                arguments: '{"selector":"h1"}',
            },
        }]);
    });
});

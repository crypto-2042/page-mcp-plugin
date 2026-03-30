import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractStreamEventsFromBuffer } from './stream-events.js';
import { accumulateToolCallDeltas } from '../content/chat-stream.js';

describe('extractStreamEventsFromBuffer', () => {
    it('emits text chunks, tool call chunks, and done in SSE order', () => {
        const input = [
            'data: {"choices":[{"delta":{"content":"Let me check."}}]}',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_title","arguments":"{}"}}]}}]}',
            'data: [DONE]',
            '',
        ].join('\n');

        const result = extractStreamEventsFromBuffer(input);

        expect(result).toEqual({
            events: [
                { type: 'CHUNK', delta: 'Let me check.' },
                {
                    type: 'TOOL_CALL_CHUNK',
                    toolCalls: [{
                        index: 0,
                        id: 'call_1',
                        type: 'function',
                        function: {
                            name: 'read_title',
                            arguments: '{}',
                        },
                    }],
                },
                { type: 'DONE' },
            ],
            remainder: '',
            done: true,
        });
    });

    it('keeps incomplete trailing data as remainder', () => {
        const input = 'data: {"choices":[{"delta":{"content":"hello"}}]}\ndata: {"choices":';

        const result = extractStreamEventsFromBuffer(input);

        expect(result.events).toEqual([{ type: 'CHUNK', delta: 'hello' }]);
        expect(result.remainder).toBe('data: {"choices":');
        expect(result.done).toBe(false);
    });

    it('reconstructs a provider-style multi-part tool call from fixture SSE', () => {
        const fixture = readFileSync(resolve(__dirname, '__fixtures__/openai-tool-call-stream.txt'), 'utf-8');

        const result = extractStreamEventsFromBuffer(fixture);
        const toolCallDeltas = result.events
            .filter((event): event is Extract<typeof event, { type: 'TOOL_CALL_CHUNK' }> => event.type === 'TOOL_CALL_CHUNK')
            .flatMap((event) => event.toolCalls);
        const toolCalls = accumulateToolCallDeltas(toolCallDeltas);

        expect(result.done).toBe(true);
        expect(result.events[0]).toEqual({ type: 'CHUNK', delta: 'Let me inspect the page first.' });
        expect(toolCalls).toEqual([{
            id: 'call_1',
            type: 'function',
            function: {
                name: 'read_title',
                arguments: '{"selector":"h1.title","trim":true}',
            },
        }]);
    });
});

import { describe, expect, it } from 'vitest';
import { buildOpenAiToolsFromCatalog, toOpenAiConversationMessages } from './mcp-openai.js';

describe('mcp-openai helpers', () => {
    it('maps execution catalog items into OpenAI function definitions', () => {
        const tools = buildOpenAiToolsFromCatalog([
            {
                openAiName: 'tool_a',
                displayName: 'Tool A',
                description: 'Tool A description',
                parameters: { type: 'object', properties: {} },
                execute: async () => ({}),
            } as any,
        ]);

        expect(tools).toEqual([
            {
                type: 'function',
                function: {
                    name: 'tool_a',
                    description: 'Tool A description',
                    parameters: { type: 'object', properties: {} },
                },
            },
        ]);
    });

    it('converts conversation messages into OpenAI chat messages (excludes tool messages)', () => {
        const messages = toOpenAiConversationMessages([
            { role: 'system', content: 'hidden context', hidden: true },
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi' },
            { role: 'tool', content: '{"ok":true}', toolCallId: 'call_1' },
        ] as any);

        // tool messages are excluded — they are ephemeral to a single turn
        expect(messages).toEqual([
            { role: 'system', content: 'hidden context' },
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi' },
        ]);
    });
});

import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../shared/types.js';
import { runMcpConversationTurn } from './mcp-conversation-turn.js';

describe('runMcpConversationTurn', () => {
    it('streams a final assistant response when no tool calls are requested', async () => {
        const updates: ChatMessage[][] = [];
        const persisted: ChatMessage[][] = [];

        await runMcpConversationTurn({
            conversationMessages: [
                { id: 'user-1', role: 'user', content: 'hello', timestamp: 1 },
            ],
            buildExecutableTools: () => [],
            toOpenAiMessages: () => [{ role: 'user', content: 'hello' }],
            buildOpenAiTools: () => [],
            formatToolResult: (result) => JSON.stringify(result ?? null),
            callCompletions: vi.fn(async () => ({
                choices: [{ message: { role: 'assistant' as const, content: 'fallback text' } }],
            })),
            streamCompletion: async (_messages, onDelta) => {
                onDelta('streamed');
            },
            persistConversation: async (messages) => {
                persisted.push(messages);
            },
            updateConversation: (messages) => {
                updates.push(messages);
            },
        });

        expect(updates.at(-1)?.at(-1)?.role).toBe('assistant');
        expect(updates.at(-1)?.at(-1)?.content).toBe('streamed');
        expect(persisted.at(-1)?.at(-1)?.content).toBe('streamed');
    });

    it('records tool messages when the assistant requests tool calls', async () => {
        const updates: ChatMessage[][] = [];

        await runMcpConversationTurn({
            conversationMessages: [
                { id: 'user-1', role: 'user', content: 'read title', timestamp: 1 },
            ],
            buildExecutableTools: () => [{
                openAiName: 'read_title',
                displayName: 'read_title',
                description: 'Read title',
                parameters: { type: 'object', properties: {} },
                execute: async () => ({ title: 'Hello' }),
            }],
            toOpenAiMessages: () => [{ role: 'user', content: 'read title' }],
            buildOpenAiTools: () => [{
                type: 'function' as const,
                function: {
                    name: 'read_title',
                    description: 'Read title',
                    parameters: { type: 'object', properties: {} },
                },
            }],
            formatToolResult: (result) => JSON.stringify(result ?? null),
            callCompletions: vi
                .fn()
                .mockResolvedValueOnce({
                    choices: [{
                        message: {
                            role: 'assistant' as const,
                            content: '',
                            tool_calls: [{
                                id: 'call_1',
                                type: 'function',
                                function: {
                                    name: 'read_title',
                                    arguments: '{}',
                                },
                            }],
                        },
                    }],
                })
                .mockResolvedValueOnce({
                    choices: [{ message: { role: 'assistant' as const, content: 'done' } }],
                }),
            streamCompletion: async (_messages, onDelta) => {
                onDelta('done');
            },
            persistConversation: async () => {},
            updateConversation: (messages) => {
                updates.push(messages);
            },
        });

        const toolMessage = updates.flat().find((message) => message.role === 'tool');
        expect(toolMessage?.toolCalls?.[0]?.name).toBe('read_title');
        expect(toolMessage?.toolCalls?.[0]?.result).toEqual({ title: 'Hello' });
    });

    it('persists a visible assistant error message when the turn fails', async () => {
        const persisted: ChatMessage[][] = [];

        await runMcpConversationTurn({
            conversationMessages: [
                { id: 'user-1', role: 'user', content: 'hello', timestamp: 1 },
            ],
            buildExecutableTools: () => [],
            toOpenAiMessages: () => [{ role: 'user', content: 'hello' }],
            buildOpenAiTools: () => [],
            formatToolResult: (result) => JSON.stringify(result ?? null),
            callCompletions: vi.fn(async () => ({ choices: [{ message: { role: 'assistant' as const, content: '' } }] })),
            streamCompletion: async () => {
                throw new Error('proxy failed');
            },
            persistConversation: async (messages) => {
                persisted.push(messages);
            },
            updateConversation: () => {},
        });

        expect(persisted.at(-1)?.at(-1)?.content).toBe('**Error:** proxy failed');
    });
});

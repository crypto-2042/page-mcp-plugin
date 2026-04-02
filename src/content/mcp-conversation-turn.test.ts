import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../shared/types.js';
import { runMcpConversationTurn } from './mcp-conversation-turn.js';

function getLastToolMessage(messages: ChatMessage[][]): ChatMessage | undefined {
    return [...messages.flat()].reverse().find((message) => message.role === 'tool');
}

describe('runMcpConversationTurn', () => {
    it('streams a final assistant response when no tool calls are requested', async () => {
        const updates: ChatMessage[][] = [];
        const persisted: ChatMessage[][] = [];
        const streamCalls: any[] = [];

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
            streamCompletion: async (requestMessages, onEvent) => {
                streamCalls.push(requestMessages);
                onEvent({ type: 'text-delta', delta: 'streamed' });
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
        expect(streamCalls[0]?.[0]).toEqual(expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('call get_current_time before answering'),
        }));
        expect(persisted.at(-1)?.some((message) => message.role === 'system' && message.content.includes('get_current_time'))).toBe(false);
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
            } as any],
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
            callCompletions: vi.fn(async () => ({ choices: [] })),
            streamCompletion: vi
                .fn()
                .mockImplementationOnce(async (_messages, onEvent) => {
                    onEvent({
                        type: 'tool-call-delta',
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
                })
                .mockImplementationOnce(async (_messages, onEvent) => {
                    onEvent({ type: 'text-delta', delta: 'done' });
                }),
            persistConversation: async () => {},
            updateConversation: (messages) => {
                updates.push(messages);
            },
        });

        const toolMessage = getLastToolMessage(updates);
        expect(toolMessage?.toolCalls?.[0]?.name).toBe('read_title');
        expect(toolMessage?.toolCalls?.[0]?.result).toEqual({ title: 'Hello' });
    });

    it('shows a pending tool card before execution completes and then records duration', async () => {
        const updates: ChatMessage[][] = [];
        let releaseTool: ((value: { title: string }) => void) | undefined;
        const execute = vi.fn(() => new Promise((resolve) => {
            releaseTool = resolve as (value: { title: string }) => void;
        }));
        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy
            .mockReturnValueOnce(1000)
            .mockReturnValueOnce(1000)
            .mockReturnValueOnce(1450)
            .mockReturnValueOnce(1450);

        const turnPromise = runMcpConversationTurn({
            conversationMessages: [
                { id: 'user-1', role: 'user', content: 'read title', timestamp: 1 },
            ],
            buildExecutableTools: () => [{
                openAiName: 'read_title',
                displayName: 'read_title',
                description: 'Read title',
                parameters: { type: 'object', properties: {} },
                execute,
            } as any],
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
            callCompletions: vi.fn(async () => ({ choices: [] })),
            streamCompletion: vi
                .fn()
                .mockImplementationOnce(async (_messages, onEvent) => {
                    onEvent({
                        type: 'tool-call-delta',
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
                })
                .mockImplementationOnce(async (_messages, onEvent) => {
                    onEvent({ type: 'text-delta', delta: 'done' });
                }),
            persistConversation: async () => {},
            updateConversation: (messages) => {
                updates.push(messages);
            },
        });

        await Promise.resolve();

        const pendingToolMessage = updates.at(-1)?.find((message) => message.role === 'tool');
        expect(pendingToolMessage?.toolCalls?.[0]).toEqual(expect.objectContaining({
            id: 'call_1',
            name: 'read_title',
            status: 'pending',
            startedAt: 1000,
        }));

        releaseTool?.({ title: 'Hello' });
        await turnPromise;

        const completedToolMessage = getLastToolMessage(updates);
        expect(completedToolMessage?.toolCalls?.[0]).toEqual(expect.objectContaining({
            id: 'call_1',
            name: 'read_title',
            status: 'success',
            startedAt: 1000,
            finishedAt: 1450,
            durationMs: 450,
            result: { title: 'Hello' },
        }));

        nowSpy.mockRestore();
    });

    it('preserves assistant text that appears before a tool call', async () => {
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
            } as any],
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
            callCompletions: vi.fn(async () => ({ choices: [] })),
            streamCompletion: vi
                .fn()
                .mockImplementationOnce(async (_messages, onEvent) => {
                    onEvent({ type: 'text-delta', delta: 'Let me check that first.' });
                    onEvent({
                        type: 'tool-call-delta',
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
                })
                .mockImplementationOnce(async (_messages, onEvent) => {
                    onEvent({ type: 'text-delta', delta: 'done' });
                }),
            persistConversation: async () => {},
            updateConversation: (messages) => {
                updates.push(messages);
            },
        });

        const assistantMessage = updates
            .flat()
            .find((message) => message.role === 'assistant' && message.content === 'Let me check that first.');
        expect(assistantMessage?.content).toBe('Let me check that first.');
    });

    it('handles streamed tool-call rounds in a single pass', async () => {
        const updates: ChatMessage[][] = [];
        const persisted: ChatMessage[][] = [];
        const execute = vi.fn(async () => ({ title: 'Hello' }));

        const streamCompletion = vi
            .fn()
            .mockImplementationOnce(async (_messages, onEvent) => {
                onEvent({ type: 'text-delta', delta: 'Let me check that first.' });
                onEvent({
                    type: 'tool-call-delta',
                    toolCalls: [{
                        index: 0,
                        id: 'call_1',
                        type: 'function',
                        function: { name: 'read_title', arguments: '{}' },
                    }],
                });
            })
            .mockImplementationOnce(async (_messages, onEvent) => {
                onEvent({ type: 'text-delta', delta: 'Done.' });
            });

        await runMcpConversationTurn({
            conversationMessages: [
                { id: 'user-1', role: 'user', content: 'read title', timestamp: 1 },
            ],
            buildExecutableTools: () => [{
                openAiName: 'read_title',
                displayName: 'read_title',
                description: 'Read title',
                parameters: { type: 'object', properties: {} },
                execute,
            } as any],
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
            callCompletions: vi.fn(async () => ({ choices: [] })),
            streamCompletion,
            persistConversation: async (messages) => {
                persisted.push(messages);
            },
            updateConversation: (messages) => {
                updates.push(messages);
            },
        });

        expect(streamCompletion).toHaveBeenCalledTimes(2);
        expect(execute).toHaveBeenCalledWith({});
        expect(getLastToolMessage(updates)?.toolCalls?.[0]?.result).toEqual({ title: 'Hello' });
        expect(persisted.at(-1)?.at(-1)?.content).toBe('Done.');
    });

    it('serializes MCP tool results into structured model-facing tool content', async () => {
        const streamCalls: any[] = [];

        await runMcpConversationTurn({
            conversationMessages: [
                { id: 'user-1', role: 'user', content: 'read products', timestamp: 1 },
            ],
            buildExecutableTools: () => [{
                openAiName: 'read_products',
                displayName: 'read_products',
                description: 'Read products',
                parameters: { type: 'object', properties: {} },
                execute: async () => ({
                    content: [{ type: 'text', text: 'Found 2 products' }],
                    structuredContent: { products: [{ id: 1 }, { id: 2 }] },
                }),
            } as any],
            toOpenAiMessages: () => [{ role: 'user', content: 'read products' }],
            buildOpenAiTools: () => [{
                type: 'function' as const,
                function: {
                    name: 'read_products',
                    description: 'Read products',
                    parameters: { type: 'object', properties: {} },
                },
            }],
            formatToolResult: (result) => JSON.stringify(result ?? null),
            callCompletions: vi.fn(async () => ({ choices: [] })),
            streamCompletion: vi
                .fn()
                .mockImplementationOnce(async (messages, onEvent) => {
                    streamCalls.push(messages);
                    onEvent({
                        type: 'tool-call-delta',
                        toolCalls: [{
                            index: 0,
                            id: 'call_1',
                            type: 'function',
                            function: { name: 'read_products', arguments: '{}' },
                        }],
                    });
                })
                .mockImplementationOnce(async (messages, onEvent) => {
                    streamCalls.push(messages);
                    onEvent({ type: 'text-delta', delta: 'done' });
                }),
            persistConversation: async () => {},
            updateConversation: () => {},
        });

        const secondRoundToolMessage = streamCalls[1].find((message: any) => message.role === 'tool');
        expect(secondRoundToolMessage).toEqual({
            role: 'tool',
            tool_call_id: 'call_1',
            content: [
                'Tool succeeded.',
                '',
                'Summary:',
                'Found 2 products',
                '',
                'Structured result:',
                '{',
                '  "products": [',
                '    {',
                '      "id": 1',
                '    },',
                '    {',
                '      "id": 2',
                '    }',
                '  ]',
                '}',
            ].join('\n'),
        });
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

    it('blocks remote tool execution when confirmation is denied', async () => {
        const updates: ChatMessage[][] = [];
        const execute = vi.fn(async () => ({ ok: true }));
        const confirmRemoteTool = vi.fn(async () => false);

        await runMcpConversationTurn({
            conversationMessages: [
                { id: 'user-1', role: 'user', content: 'remote tool', timestamp: 1 },
            ],
            buildExecutableTools: () => [{
                openAiName: 'remote_tool',
                displayName: 'remote_tool',
                description: 'Remote tool',
                parameters: { type: 'object', properties: {} },
                execute,
                sourceType: 'remote',
                sourceLabel: 'remote:market',
                sourceRepositoryId: 'repo-1',
            }],
            toOpenAiMessages: () => [{ role: 'user', content: 'remote tool' }],
            buildOpenAiTools: () => [{
                type: 'function' as const,
                function: {
                    name: 'remote_tool',
                    description: 'Remote tool',
                    parameters: { type: 'object', properties: {} },
                },
            }],
            formatToolResult: (result) => JSON.stringify(result ?? null),
            callCompletions: vi.fn(async () => ({ choices: [] })),
            streamCompletion: vi
                .fn()
                .mockImplementationOnce(async (_messages, onEvent) => {
                    onEvent({
                        type: 'tool-call-delta',
                        toolCalls: [{
                            index: 0,
                            id: 'call_1',
                            type: 'function',
                            function: {
                                name: 'remote_tool',
                                arguments: '{}',
                            },
                        }],
                    });
                })
                .mockImplementationOnce(async (_messages, onEvent) => {
                    onEvent({ type: 'text-delta', delta: 'done' });
                }),
            persistConversation: async () => {},
            updateConversation: (messages) => {
                updates.push(messages);
            },
            confirmRemoteTool,
        });

        expect(confirmRemoteTool).toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
        const toolMessage = getLastToolMessage(updates);
        expect(toolMessage?.toolCalls?.[0]?.status).toBe('error');
        expect(toolMessage?.toolCalls?.[0]?.error).toBe('User canceled');
    });

    it('continues to another round after a thrown tool execution failure', async () => {
        const updates: ChatMessage[][] = [];
        const persisted: ChatMessage[][] = [];
        const execute = vi.fn(async () => {
            throw new Error('tool failed');
        });

        const streamCompletion = vi
            .fn()
            .mockImplementationOnce(async (_messages, onEvent) => {
                onEvent({
                    type: 'tool-call-delta',
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
            })
            .mockImplementationOnce(async (_messages, onEvent) => {
                onEvent({ type: 'text-delta', delta: 'The tool failed, so I could not complete that action.' });
            });

        await runMcpConversationTurn({
            conversationMessages: [
                { id: 'user-1', role: 'user', content: 'read title', timestamp: 1 },
            ],
            buildExecutableTools: () => [{
                openAiName: 'read_title',
                displayName: 'read_title',
                description: 'Read title',
                parameters: { type: 'object', properties: {} },
                execute,
            } as any],
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
            callCompletions: vi.fn(async () => ({ choices: [] })),
            streamCompletion,
            persistConversation: async (messages) => {
                persisted.push(messages);
            },
            updateConversation: (messages) => {
                updates.push(messages);
            },
        });

        expect(streamCompletion).toHaveBeenCalledTimes(2);
        const toolMessage = getLastToolMessage(updates);
        expect(toolMessage?.toolCalls?.[0]?.status).toBe('error');
        expect(toolMessage?.toolCalls?.[0]?.error).toBe('tool failed');
        expect(persisted.at(-1)?.some((message) => message.role === 'tool' && message.toolCalls?.[0]?.error === 'tool failed')).toBe(true);
        expect(persisted.at(-1)?.at(-1)?.content).toBe('The tool failed, so I could not complete that action.');
    });

    it('treats MCP isError tool results as failed tool cards', async () => {
        const updates: ChatMessage[][] = [];
        const persisted: ChatMessage[][] = [];
        const execute = vi.fn(async () => ({
            content: [
                { type: 'text', text: 'API rate limit exceeded' },
            ],
            isError: true,
        }));

        await runMcpConversationTurn({
            conversationMessages: [
                { id: 'user-1', role: 'user', content: 'read title', timestamp: 1 },
            ],
            buildExecutableTools: () => [{
                openAiName: 'read_title',
                displayName: 'read_title',
                description: 'Read title',
                parameters: { type: 'object', properties: {} },
                execute,
            } as any],
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
            callCompletions: vi.fn(async () => ({ choices: [] })),
            streamCompletion: vi
                .fn()
                .mockImplementationOnce(async (_messages, onEvent) => {
                    onEvent({
                        type: 'tool-call-delta',
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
                }),
            persistConversation: async (messages) => {
                persisted.push(messages);
            },
            updateConversation: (messages) => {
                updates.push(messages);
            },
        });

        const toolMessage = getLastToolMessage(updates);
        expect(toolMessage?.toolCalls?.[0]?.status).toBe('error');
        expect(toolMessage?.toolCalls?.[0]?.error).toBe('API rate limit exceeded');
        expect(toolMessage?.toolCalls?.[0]?.result).toEqual({
            content: [{ type: 'text', text: 'API rate limit exceeded' }],
            isError: true,
        });
        expect(persisted.at(-1)?.some((message) => message.role === 'tool' && message.toolCalls?.[0]?.status === 'error')).toBe(true);
    });

    it('continues the turn after a tool error so the assistant can respond to the failure', async () => {
        const persisted: ChatMessage[][] = [];
        const streamCompletion = vi
            .fn()
            .mockImplementationOnce(async (_messages, onEvent) => {
                onEvent({
                    type: 'tool-call-delta',
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
            })
            .mockImplementationOnce(async (_messages, onEvent) => {
                onEvent({ type: 'text-delta', delta: 'I could not read the title because the selector failed.' });
            });

        await runMcpConversationTurn({
            conversationMessages: [
                { id: 'user-1', role: 'user', content: 'read title', timestamp: 1 },
            ],
            buildExecutableTools: () => [{
                openAiName: 'read_title',
                displayName: 'read_title',
                description: 'Read title',
                parameters: { type: 'object', properties: {} },
                execute: async () => ({
                    content: [{ type: 'text', text: 'selector missing' }],
                    isError: true,
                }),
            } as any],
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
            callCompletions: vi.fn(async () => ({ choices: [] })),
            streamCompletion,
            persistConversation: async (messages) => {
                persisted.push(messages);
            },
            updateConversation: () => {},
        });

        expect(streamCompletion).toHaveBeenCalledTimes(2);
        expect(persisted.at(-1)?.at(-1)?.role).toBe('assistant');
        expect(persisted.at(-1)?.at(-1)?.content).toBe('I could not read the title because the selector failed.');
        expect(persisted.at(-1)?.some((message) => message.role === 'tool' && message.toolCalls?.[0]?.status === 'error')).toBe(true);
    });
});

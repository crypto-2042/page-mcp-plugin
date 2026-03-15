import { describe, expect, it, vi } from 'vitest';
import { createMcpChatRuntime } from './mcp-chat-runtime.js';

describe('createMcpChatRuntime', () => {
    it('adapts proxy/model/catalog dependencies into a prepared conversation turn runner', async () => {
        const runTurn = vi.fn(async () => []);
        const buildExecutionCatalog = vi.fn(() => [{
            openAiName: 'tool__a',
            displayName: 'Tool A',
            description: 'Tool A',
            parameters: {},
            execute: async () => ({}),
            sourceType: 'native' as const,
            sourceLabel: 'Local Tool',
        }]);
        const buildOpenAiToolsFromCatalog = vi.fn(() => [{
            type: 'function' as const,
            function: { name: 'tool__a', description: 'a', parameters: {} },
        }]);
        const safeRuntimeMessage = vi.fn(async () => ({ data: { choices: [] } })) as any;
        const streamCompletion = vi.fn(async () => {});
        const persistConversation = vi.fn(async () => {});
        const updateConversation = vi.fn();

        const runtime = createMcpChatRuntime({
            model: 'gpt-4o',
            mcpClient: {} as any,
            tools: [] as any,
            buildExecutionCatalog,
            buildOpenAiToolsFromCatalog,
            toOpenAiMessages: (messages) => messages as any,
            formatToolResult: (result) => JSON.stringify(result ?? null),
            safeRuntimeMessage,
            streamCompletion,
            runConversationTurn: runTurn,
        });

        await runtime.runPreparedTurn({
            conversationMessages: [{ id: 'msg_1', role: 'user', content: 'hello', timestamp: 1 }],
            updateConversation,
            persistConversation,
        });

        expect(runTurn).toHaveBeenCalledOnce();
        expect(buildExecutionCatalog).toHaveBeenCalledOnce();
        expect(buildOpenAiToolsFromCatalog).not.toHaveBeenCalled();

        const call = (runTurn as any).mock.calls[0]?.[0] as any;
        expect(call?.formatToolResult).toBeTypeOf('function');
        await call?.callCompletions([{ role: 'user', content: 'hello' }]);
        expect(buildOpenAiToolsFromCatalog).toHaveBeenCalledOnce();
        expect(safeRuntimeMessage).toHaveBeenCalledWith('PROXY_API_CALL', expect.objectContaining({
            type: 'PROXY_API_CALL',
            endpoint: '/chat/completions',
            payload: expect.objectContaining({ model: 'gpt-4o' }),
        }));
    });
});

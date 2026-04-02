import { describe, expect, it, vi } from 'vitest';
import type { Conversation } from '../shared/types.js';
import { runChatAction } from './mcp-chat-actions.js';

describe('runChatAction', () => {
    it('bootstraps a conversation, appends prepared messages, and delegates to the runtime', async () => {
        const setLoading = vi.fn();
        const setActiveConvId = vi.fn();
        const upsertConversation = vi.fn();
        const runPreparedTurn = vi.fn(async (conversation: Conversation) => conversation);

        await runChatAction({
            activeConversation: null,
            createConversation: () => ({
                id: 'conv_1',
                title: 'New Chat',
                domain: 'example.com',
                createdAt: 1,
                updatedAt: 1,
                messages: [],
            }),
            prepareMessages: async () => [
                { id: 'msg_1', role: 'user', content: 'hello', timestamp: 2 },
            ],
            upsertConversation,
            setActiveConversationId: setActiveConvId,
            setLoading,
            runPreparedTurn,
            persistConversation: vi.fn(async () => {}),
        });

        expect(setActiveConvId).toHaveBeenCalledWith('conv_1');
        expect(upsertConversation).toHaveBeenCalledWith(expect.objectContaining({
            id: 'conv_1',
            messages: [expect.objectContaining({ content: 'hello' })],
        }));
        expect(runPreparedTurn).toHaveBeenCalledWith(expect.objectContaining({
            id: 'conv_1',
            messages: [expect.objectContaining({ content: 'hello' })],
        }));
        expect(setLoading.mock.calls).toEqual([[true], [false]]);
    });

    it('persists a visible assistant error when message preparation fails', async () => {
        const persistConversation = vi.fn(async () => {});
        const upsertConversation = vi.fn();

        await runChatAction({
            activeConversation: {
                id: 'conv_1',
                title: 'Existing',
                domain: 'example.com',
                createdAt: 1,
                updatedAt: 1,
                messages: [],
            },
            createConversation: () => {
                throw new Error('should not create');
            },
            prepareMessages: async () => {
                throw new Error('prepare failed');
            },
            upsertConversation,
            setActiveConversationId: vi.fn(),
            setLoading: vi.fn(),
            runPreparedTurn: vi.fn(),
            persistConversation,
        });

        expect(persistConversation).toHaveBeenCalledWith(expect.objectContaining({
            messages: [expect.objectContaining({ content: '**Error:** prepare failed' })],
        }));
    });

    it('creates a fresh conversation when requested even if one is active', async () => {
        const setLoading = vi.fn();
        const setActiveConvId = vi.fn();
        const upsertConversation = vi.fn();
        const runPreparedTurn = vi.fn(async (conversation: Conversation) => conversation);

        await runChatAction({
            activeConversation: {
                id: 'conv_existing',
                title: 'Existing',
                domain: 'example.com',
                createdAt: 1,
                updatedAt: 1,
                messages: [{ id: 'msg_old', role: 'user', content: 'old context', timestamp: 2 }],
            },
            createConversation: () => ({
                id: 'conv_new',
                title: 'New Chat',
                domain: 'example.com',
                createdAt: 3,
                updatedAt: 3,
                messages: [],
            }),
            prepareMessages: async () => [
                { id: 'msg_1', role: 'user', content: 'shortcut prompt', timestamp: 4 },
            ],
            upsertConversation,
            setActiveConversationId: setActiveConvId,
            setLoading,
            runPreparedTurn,
            persistConversation: vi.fn(async () => {}),
            createFreshConversation: true,
        });

        expect(setActiveConvId).toHaveBeenCalledWith('conv_new');
        expect(upsertConversation).toHaveBeenCalledWith(expect.objectContaining({
            id: 'conv_new',
            messages: [expect.objectContaining({ content: 'shortcut prompt' })],
        }));
        expect(runPreparedTurn).toHaveBeenCalledWith(expect.objectContaining({
            id: 'conv_new',
            messages: [expect.objectContaining({ content: 'shortcut prompt' })],
        }));
        expect(runPreparedTurn).not.toHaveBeenCalledWith(expect.objectContaining({
            id: 'conv_existing',
        }));
    });
});

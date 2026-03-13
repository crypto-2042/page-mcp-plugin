import { useState, useEffect } from 'react';
import type { Conversation, ChatMessage } from '../../shared/types.js';
import { generateConversationId, generateMessageId } from '../../shared/id.js';
import { safeRuntimeMessage } from '../safe-runtime.js';

export function useConversationManager(currentDomain: string, t: (key: string) => string) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);

    const activeConv = conversations.find(c => c.id === activeConvId) ?? null;

    useEffect(() => {
        (async () => {
            const res = await safeRuntimeMessage<{ conversations?: Conversation[] }>(
                'GET_CONVERSATIONS',
                { type: 'GET_CONVERSATIONS', domain: currentDomain }
            );
            if (res?.conversations) setConversations(res.conversations);
        })();
    }, [currentDomain]);

    const persistConv = async (conv: Conversation) => {
        conv.updatedAt = Date.now();
        if (conv.title === 'New Chat' || conv.title === t('newChatTitle')) {
            const first = conv.messages.find(m => m.role === 'user');
            if (first) {
                conv.title = first.content.slice(0, 40) + (first.content.length > 40 ? '...' : '');
            }
        }

        let newConvs = [...conversations];
        const idx = newConvs.findIndex(c => c.id === conv.id);
        if (idx >= 0) newConvs[idx] = conv;
        else newConvs.unshift(conv);

        setConversations(newConvs);
        await safeRuntimeMessage('SAVE_CONVERSATION', { type: 'SAVE_CONVERSATION', conversation: conv });
    };

    const startNewChat = () => {
        const newId = generateConversationId();
        const newConv: Conversation = {
            id: newId,
            title: t('newChatTitle') || 'New Chat',
            domain: currentDomain,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
        };
        setConversations(prev => [newConv, ...prev]);
        setActiveConvId(newId);
    };

    const deleteConv = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = conversations.filter(c => c.id !== id);
        setConversations(updated);
        await safeRuntimeMessage('DELETE_CONVERSATION', { type: 'DELETE_CONVERSATION', conversationId: id });
        if (activeConvId === id) setActiveConvId(null);
    };

    const upsertConversation = (conv: Conversation) => {
        setConversations(prev => {
            const copy = [...prev];
            const idx = copy.findIndex(c => c.id === conv.id);
            if (idx >= 0) copy[idx] = conv;
            else copy.unshift(conv);
            return copy;
        });
    };

    const createConversation = (): Conversation => ({
        id: generateConversationId(),
        title: t('newChatTitle') || 'New Chat',
        domain: currentDomain,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
    });

    return {
        conversations,
        activeConvId,
        activeConv,
        setActiveConvId,
        startNewChat,
        deleteConv,
        persistConv,
        upsertConversation,
        createConversation,
    };
}

import type { ChatMessage, Conversation } from '../shared/types.js';

export async function runChatAction(params: {
    activeConversation: Conversation | null;
    createConversation: () => Conversation;
    prepareMessages: (conversation: Conversation) => Promise<ChatMessage[]>;
    upsertConversation: (conversation: Conversation) => void;
    setActiveConversationId: (id: string) => void;
    setLoading: (loading: boolean) => void;
    runPreparedTurn: (conversation: Conversation) => Promise<Conversation>;
    persistConversation: (conversation: Conversation) => Promise<void>;
}) {
    let conversation = params.activeConversation;
    if (!conversation) {
        conversation = params.createConversation();
        params.setActiveConversationId(conversation.id);
    }

    params.setLoading(true);
    try {
        const preparedMessages = await params.prepareMessages(conversation);
        conversation = {
            ...conversation,
            messages: [...conversation.messages, ...preparedMessages],
        };
        params.upsertConversation(conversation);
        await params.runPreparedTurn(conversation);
    } catch (error) {
        const errorMessage: ChatMessage = {
            id: `msg_${Date.now() + 2}`,
            role: 'assistant',
            content: `**Error:** ${(error as Error).message}`,
            timestamp: Date.now(),
        };
        conversation = {
            ...conversation,
            messages: [...conversation.messages, errorMessage],
        };
        await params.persistConversation(conversation);
    } finally {
        params.setLoading(false);
    }
}

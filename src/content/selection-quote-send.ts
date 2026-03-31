import type { ChatMessage, ConversationQuote } from '../shared/types.js';
import { buildSelectionQuoteMessages } from './selection-quote-context.js';

export function buildSelectionQuoteTurnMessages(params: {
    draftQuote?: ConversationQuote | null;
    pinnedQuote?: ConversationQuote | null;
}): ChatMessage[] {
    return buildSelectionQuoteMessages({
        draftQuote: params.draftQuote ?? undefined,
        pinnedQuote: params.pinnedQuote ?? undefined,
    });
}

export function stripSelectionQuoteMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.filter((message) => !message.id.startsWith('msg_selection_quote_'));
}

export function shouldClearSelectionQuoteDraft(params: {
    shouldClearDraftQuoteAfterCommit: boolean;
    turnCompleted: boolean;
    currentDraft?: ConversationQuote | null;
    participatingDraft?: ConversationQuote | null;
}): boolean {
    if (!params.shouldClearDraftQuoteAfterCommit || !params.turnCompleted) {
        return false;
    }

    if (!params.currentDraft || !params.participatingDraft) {
        return false;
    }

    return (
        params.currentDraft.createdAt === params.participatingDraft.createdAt
        && params.currentDraft.text === params.participatingDraft.text
    );
}

import type { ChatMessage, ConversationQuote } from '../shared/types.js';
import { buildSelectionQuoteMessages } from './selection-quote-context.js';

export function buildSelectionQuotePreparedMessages(params: {
    draftQuote?: ConversationQuote | null;
    pinnedQuote?: ConversationQuote | null;
    baseMessages: ChatMessage[];
}): {
    messages: ChatMessage[];
    shouldClearDraftQuoteAfterCommit: boolean;
} {
    const quoteMessages = buildSelectionQuoteMessages({
        draftQuote: params.draftQuote ?? undefined,
        pinnedQuote: params.pinnedQuote ?? undefined,
    });

    return {
        messages: [...quoteMessages, ...params.baseMessages],
        shouldClearDraftQuoteAfterCommit: !!params.draftQuote && params.draftQuote.text.trim().length > 0,
    };
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

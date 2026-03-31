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
}): boolean {
    return params.shouldClearDraftQuoteAfterCommit && params.turnCompleted;
}

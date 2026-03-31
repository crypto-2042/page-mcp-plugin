import type { ChatMessage, ConversationQuote } from '../shared/types.js';

export const MAX_SELECTION_QUOTE_CHARS = 4000;

function buildSelectionQuoteMessageId(kind: 'draft' | 'pinned', createdAt: number): string {
    return `msg_selection_quote_${kind}_${createdAt}`;
}

export function truncateSelectionQuoteText(text: string, maxChars: number = MAX_SELECTION_QUOTE_CHARS): string {
    return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function buildSelectionQuoteMessage(params: {
    quote: ConversationQuote;
    kind: 'draft' | 'pinned';
}): ChatMessage {
    const text = truncateSelectionQuoteText(params.quote.text);
    const prefix =
        params.kind === 'draft'
            ? 'Selected page text for this conversation turn:'
            : 'Pinned selected page text for this conversation:';
    const tagName = params.kind === 'draft' ? 'selection_quote' : 'pinned_selection_quote';

    return {
        id: buildSelectionQuoteMessageId(params.kind, params.quote.createdAt),
        role: 'system',
        content: `${prefix}\n\n<${tagName}>\n${text}\n</${tagName}>`,
        timestamp: params.quote.createdAt,
        hidden: true,
    };
}

export function buildSelectionQuoteMessages(params: {
    draftQuote?: ConversationQuote;
    pinnedQuote?: ConversationQuote;
}): ChatMessage[] {
    const messages: ChatMessage[] = [];

    if (params.draftQuote && params.draftQuote.text.trim().length > 0) {
        messages.push(buildSelectionQuoteMessage({ quote: params.draftQuote, kind: 'draft' }));
    }

    if (params.pinnedQuote && params.pinnedQuote.text.trim().length > 0) {
        messages.push(buildSelectionQuoteMessage({ quote: params.pinnedQuote, kind: 'pinned' }));
    }

    return messages;
}

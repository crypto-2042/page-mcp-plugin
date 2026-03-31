import React from 'react';
import { Pin, X } from 'lucide-react';
import type { Conversation, ConversationQuote } from '../shared/types.js';

export const MAX_SELECTION_QUOTE_PREVIEW_CHARS = 180;

export type SelectionQuoteUiState = {
    draftQuote: ConversationQuote | null;
    panelOpen: boolean;
};

export type SelectionQuoteDisplayState = {
    quote: ConversationQuote;
    pinned: boolean;
};

export function normalizeSelectionQuoteText(text: string): string {
    return text.trim();
}

export function createSelectionQuoteDraft(text: string, createdAt: number = Date.now()): ConversationQuote | null {
    const normalized = normalizeSelectionQuoteText(text);
    if (!normalized) return null;
    return { text: normalized, createdAt };
}

export function applyIncomingSelectionQuote(current: SelectionQuoteUiState, text: string, createdAt: number = Date.now()): SelectionQuoteUiState {
    const draftQuote = createSelectionQuoteDraft(text, createdAt);
    if (!draftQuote) return current;
    return {
        draftQuote,
        panelOpen: true,
    };
}

export function getSelectionQuoteDisplayState(params: {
    draftQuote: ConversationQuote | null;
    activeConversation: Pick<Conversation, 'pinnedQuote'> | null;
}): SelectionQuoteDisplayState | null {
    if (params.draftQuote) {
        return {
            quote: params.draftQuote,
            pinned: false,
        };
    }

    if (params.activeConversation?.pinnedQuote) {
        return {
            quote: params.activeConversation.pinnedQuote,
            pinned: true,
        };
    }

    return null;
}

export function pinSelectionQuoteConversation(params: {
    conversation: Conversation;
    quote: ConversationQuote;
}): Conversation {
    return {
        ...params.conversation,
        pinnedQuote: params.quote,
    };
}

export function truncateSelectionQuotePreviewText(text: string, maxChars: number = MAX_SELECTION_QUOTE_PREVIEW_CHARS): string {
    const normalized = normalizeSelectionQuoteText(text);
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars)}…`;
}

export function SelectionQuoteChip(props: {
    quote: ConversationQuote;
    onClose?: () => void;
    onPin?: () => void;
    pinned?: boolean;
}) {
    const previewText = truncateSelectionQuotePreviewText(props.quote.text);
    const isPinned = !!props.pinned;

    return (
        <div className={`pmcp-selection-quote-chip ${isPinned ? 'pinned' : 'draft'}`}>
            <div className="pmcp-selection-quote-marker" aria-hidden="true">
                <span className="pmcp-selection-quote-marker-icon">quote</span>
            </div>
            <div className="pmcp-selection-quote-content">
                <div className="pmcp-selection-quote-label">{isPinned ? 'Pinned quote' : 'Selection quote'}</div>
                <div className="pmcp-selection-quote-text" title={props.quote.text}>
                    {previewText}
                </div>
            </div>
            <div className="pmcp-selection-quote-actions">
                <button
                    className="pmcp-selection-quote-btn pmcp-selection-quote-pin"
                    type="button"
                    onClick={props.onPin}
                    disabled={!props.onPin}
                    aria-label={isPinned ? 'Pinned quote' : 'Pin quote'}
                    title={isPinned ? 'Pinned quote' : 'Pin quote'}
                >
                    <Pin size={14} />
                </button>
                {props.onClose && (
                    <button
                        className="pmcp-selection-quote-btn pmcp-selection-quote-close"
                        type="button"
                        onClick={props.onClose}
                        aria-label="Remove quote"
                        title="Remove quote"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
        </div>
    );
}

export function SelectionQuoteArea(props: {
    open: boolean;
    quote: ConversationQuote | null;
    pinned?: boolean;
    onClose?: () => void;
    onPin?: () => void;
}) {
    if (!props.quote) return null;

    return (
        <div className={`pmcp-selection-quote-strip ${props.open ? 'open' : ''}`}>
            <SelectionQuoteChip
                quote={props.quote}
                pinned={props.pinned}
                onClose={props.onClose}
                onPin={props.onPin}
            />
        </div>
    );
}

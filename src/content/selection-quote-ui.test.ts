import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Conversation, ConversationQuote, PluginMessage } from '../shared/types.js';
import {
    clearSelectionQuoteConversation,
    SelectionQuoteArea,
    createSelectionQuoteDraft,
    getSelectionQuoteDisplayState,
    pinSelectionQuoteConversation,
} from './selection-quote-ui.js';
import { registerSelectionQuoteRuntimeListener } from './selection-quote-runtime.js';

const runtimeOnMessageAddListener = vi.fn();
const runtimeOnMessageRemoveListener = vi.fn();

let messageListener: ((message: PluginMessage) => void | Promise<void>) | null = null;

function installChromeMock() {
    vi.stubGlobal('chrome', {
        runtime: {
            onMessage: {
                addListener: (listener: (message: PluginMessage) => void | Promise<void>) => {
                    messageListener = listener;
                    runtimeOnMessageAddListener(listener);
                },
                removeListener: (listener: (message: PluginMessage) => void | Promise<void>) => {
                    runtimeOnMessageRemoveListener(listener);
                    if (messageListener === listener) {
                        messageListener = null;
                    }
                },
            },
        },
    } as any);
}

function renderSelectionQuoteArea(quote: ConversationQuote | null, open: boolean) {
    return renderToStaticMarkup(
        React.createElement(SelectionQuoteArea, {
            open,
            quote,
            onClose: () => {},
        }),
    );
}

function renderPinnedSelectionQuote(quote: ConversationQuote | null, open: boolean) {
    return renderToStaticMarkup(
        React.createElement(SelectionQuoteArea, {
            open,
            quote,
            pinned: true,
            onClose: () => {},
        }),
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    messageListener = null;
    installChromeMock();
});

describe('selection quote runtime listener', () => {
    it('opens the quote area and shows the chip when ADD_SELECTION_QUOTE is received', () => {
        const state = {
            draftQuote: null as ConversationQuote | null,
            panelOpen: false,
        };
        const setDraftQuote = vi.fn((quote: ConversationQuote) => {
            state.draftQuote = quote;
        });
        const openPanel = vi.fn(() => {
            state.panelOpen = true;
        });

        const cleanup = registerSelectionQuoteRuntimeListener({
            onQuote: setDraftQuote,
            onOpenPanel: openPanel,
        });

        expect(runtimeOnMessageAddListener).toHaveBeenCalledTimes(1);

        messageListener?.({ type: 'ADD_SELECTION_QUOTE', text: 'Selected text from the page' });

        expect(setDraftQuote).toHaveBeenCalledWith({
            text: 'Selected text from the page',
            createdAt: expect.any(Number),
        });
        expect(openPanel).toHaveBeenCalledTimes(1);
        expect(state.panelOpen).toBe(true);
        expect(state.draftQuote?.text).toBe('Selected text from the page');

        const markup = renderSelectionQuoteArea(state.draftQuote, state.panelOpen);
        expect(markup).toContain('pmcp-selection-quote-strip open');
        expect(markup).toContain('Selection quote');
        expect(markup).toContain('Selected text from the page');

        cleanup();
        expect(runtimeOnMessageRemoveListener).toHaveBeenCalledTimes(1);
    });

    it('replaces the first displayed quote when a second selection arrives', () => {
        const state = {
            draftQuote: null as ConversationQuote | null,
            panelOpen: false,
        };
        const setDraftQuote = vi.fn((quote: ConversationQuote) => {
            state.draftQuote = quote;
        });
        const openPanel = vi.fn(() => {
            state.panelOpen = true;
        });

        registerSelectionQuoteRuntimeListener({
            onQuote: setDraftQuote,
            onOpenPanel: openPanel,
        });

        messageListener?.({ type: 'ADD_SELECTION_QUOTE', text: 'First selection' });
        const firstQuote = state.draftQuote;
        expect(firstQuote?.text).toBe('First selection');

        messageListener?.({ type: 'ADD_SELECTION_QUOTE', text: 'Second selection' });
        expect(state.draftQuote?.text).toBe('Second selection');
        expect(state.draftQuote?.text).not.toBe(firstQuote?.text);
        expect(openPanel).toHaveBeenCalledTimes(2);

        const markup = renderSelectionQuoteArea(state.draftQuote, state.panelOpen);
        expect(markup).toContain('Second selection');
        expect(markup).not.toContain('First selection');
    });

    it('prefers a new draft quote over a pinned quote', () => {
        const pinnedQuote = createSelectionQuoteDraft('Pinned quote', 111);
        const draftQuote = createSelectionQuoteDraft('Draft quote', 222);

        expect(getSelectionQuoteDisplayState({
            draftQuote,
            activeConversation: {
                pinnedQuote: pinnedQuote!,
            },
        })).toEqual({
            quote: draftQuote!,
            pinned: false,
        });
    });

    it('pins the draft quote onto the active conversation state', () => {
        const draftQuote = createSelectionQuoteDraft('Pinned quote text', 123);
        expect(draftQuote).not.toBeNull();

        const activeConversation: Conversation = {
            id: 'conv-a',
            title: 'New Chat',
            domain: 'example.com',
            createdAt: 1,
            updatedAt: 1,
            messages: [],
        };

        const pinnedConversation = pinSelectionQuoteConversation({
            conversation: activeConversation,
            quote: draftQuote!,
        });

        expect(pinnedConversation.pinnedQuote).toEqual(draftQuote);
        expect(getSelectionQuoteDisplayState({
            draftQuote: null,
            activeConversation: pinnedConversation,
        })).toEqual({
            quote: draftQuote!,
            pinned: true,
        });

        const markup = renderPinnedSelectionQuote(draftQuote, true);
        expect(markup).toContain('Pinned quote');
        expect(markup).toContain('Pinned quote text');
    });

    it('removes a pinned quote from a conversation', () => {
        const pinnedQuote = createSelectionQuoteDraft('Conversation-level pinned quote', 456);
        expect(pinnedQuote).not.toBeNull();

        const conversationWithPinnedQuote: Conversation = {
            id: 'conv-b',
            title: 'Pinned Chat',
            domain: 'example.com',
            createdAt: 2,
            updatedAt: 2,
            messages: [],
            pinnedQuote: pinnedQuote!,
        };

        expect(clearSelectionQuoteConversation(conversationWithPinnedQuote)).not.toHaveProperty('pinnedQuote');
    });

    it('can unpin a pinned quote back into a visible draft state', () => {
        const pinnedQuote = createSelectionQuoteDraft('Pinned but unsent quote', 456);
        expect(pinnedQuote).not.toBeNull();

        const conversationWithPinnedQuote: Conversation = {
            id: 'conv-b',
            title: 'Pinned Chat',
            domain: 'example.com',
            createdAt: 2,
            updatedAt: 2,
            messages: [],
            pinnedQuote: pinnedQuote!,
        };

        const clearedConversation = clearSelectionQuoteConversation(conversationWithPinnedQuote);

        expect(clearedConversation).not.toHaveProperty('pinnedQuote');
        expect(getSelectionQuoteDisplayState({
            draftQuote: pinnedQuote!,
            activeConversation: clearedConversation,
        })).toEqual({
            quote: pinnedQuote!,
            pinned: false,
        });
    });

    it('loads and renders a pinned quote from the active conversation when switching conversations', () => {
        const pinnedQuote = createSelectionQuoteDraft('Conversation-level pinned quote', 456);
        expect(pinnedQuote).not.toBeNull();

        const conversationWithPinnedQuote: Conversation = {
            id: 'conv-b',
            title: 'Pinned Chat',
            domain: 'example.com',
            createdAt: 2,
            updatedAt: 2,
            messages: [],
            pinnedQuote: pinnedQuote!,
        };

        const anotherConversation: Conversation = {
            id: 'conv-c',
            title: 'Another Chat',
            domain: 'example.com',
            createdAt: 3,
            updatedAt: 3,
            messages: [],
        };

        const display = getSelectionQuoteDisplayState({
            draftQuote: null,
            activeConversation: conversationWithPinnedQuote,
        });

        expect(display).toEqual({
            quote: pinnedQuote!,
            pinned: true,
        });

        expect(getSelectionQuoteDisplayState({
            draftQuote: null,
            activeConversation: anotherConversation,
        })).toBeNull();

        const markup = renderPinnedSelectionQuote(display?.quote ?? null, true);
        expect(markup).toContain('Pinned quote');
        expect(markup).toContain('Conversation-level pinned quote');
    });

    it('renders localized quote labels when provided', () => {
        const quote = createSelectionQuoteDraft('Localized quote text', 789);
        expect(quote).not.toBeNull();

        const markup = renderToStaticMarkup(
            React.createElement(SelectionQuoteArea, {
                open: true,
                quote,
                pinned: false,
                onClose: () => {},
                labels: {
                    draftLabel: 'Localized draft label',
                    pinnedLabel: 'Localized pinned label',
                    pinButtonLabel: 'Localized pin button',
                    pinnedButtonLabel: 'Localized pinned button',
                    unpinButtonLabel: 'Localized unpin button',
                    removeButtonLabel: 'Localized remove button',
                },
            }),
        );

        expect(markup).toContain('Localized draft label');
        expect(markup).toContain('Localized pin button');
        expect(markup).toContain('Localized remove button');
        expect(markup).not.toContain('title="Localized quote text"');
    });

    it('uses the unpin label for pinned quote actions', () => {
        const quote = createSelectionQuoteDraft('Pinned localized quote text', 790);
        expect(quote).not.toBeNull();

        const markup = renderToStaticMarkup(
            React.createElement(SelectionQuoteArea, {
                open: true,
                quote,
                pinned: true,
                onClose: () => {},
                onPin: () => {},
                labels: {
                    draftLabel: 'Localized draft label',
                    pinnedLabel: 'Localized pinned label',
                    pinButtonLabel: 'Localized pin button',
                    pinnedButtonLabel: 'Localized pinned button',
                    unpinButtonLabel: 'Localized unpin button',
                    removeButtonLabel: 'Localized remove button',
                },
            }),
        );

        expect(markup).toContain('aria-label="Localized unpin button"');
    });

    it('ignores blank selection text', () => {
        expect(createSelectionQuoteDraft('   ')).toBeNull();
    });
});

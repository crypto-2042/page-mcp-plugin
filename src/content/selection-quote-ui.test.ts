import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationQuote, PluginMessage } from '../shared/types.js';
import { SelectionQuoteArea } from './selection-quote-ui.js';
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

    it('ignores blank selection text', () => {
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

        messageListener?.({ type: 'ADD_SELECTION_QUOTE', text: '   ' });

        expect(setDraftQuote).not.toHaveBeenCalled();
        expect(openPanel).not.toHaveBeenCalled();
        expect(state.draftQuote).toBeNull();
        expect(state.panelOpen).toBe(false);
        expect(renderSelectionQuoteArea(state.draftQuote, state.panelOpen)).toBe('');
    });
});

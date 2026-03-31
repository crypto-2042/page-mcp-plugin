import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
    SelectionQuoteArea,
    applyIncomingSelectionQuote,
    createSelectionQuoteDraft,
} from './selection-quote-ui.js';

describe('selection quote chat ui', () => {
    it('opens the quote area and shows the chip when a selection quote arrives', () => {
        const next = applyIncomingSelectionQuote(
            { draftQuote: null, panelOpen: false },
            'Selected text from the page',
            123,
        );

        expect(next.panelOpen).toBe(true);
        expect(next.draftQuote).toEqual({
            text: 'Selected text from the page',
            createdAt: 123,
        });

        const markup = renderToStaticMarkup(
            React.createElement(SelectionQuoteArea, {
                open: next.panelOpen,
                quote: next.draftQuote,
                onClose: () => {},
            }),
        );

        expect(markup).toContain('pmcp-selection-quote-strip open');
        expect(markup).toContain('Selection quote');
        expect(markup).toContain('Selected text from the page');
    });

    it('replaces the first displayed quote when a second selection arrives', () => {
        const first = applyIncomingSelectionQuote(
            { draftQuote: null, panelOpen: false },
            'First selection',
            111,
        );
        const second = applyIncomingSelectionQuote(first, 'Second selection', 222);

        expect(second.panelOpen).toBe(true);
        expect(second.draftQuote).toEqual({
            text: 'Second selection',
            createdAt: 222,
        });
        expect(second.draftQuote?.text).not.toBe(first.draftQuote?.text);

        const markup = renderToStaticMarkup(
            React.createElement(SelectionQuoteArea, {
                open: second.panelOpen,
                quote: second.draftQuote,
                onClose: () => {},
            }),
        );

        expect(markup).toContain('Second selection');
        expect(markup).not.toContain('First selection');
    });

    it('ignores blank selection text', () => {
        expect(createSelectionQuoteDraft('   ')).toBeNull();
    });
});

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    MAX_SELECTION_QUOTE_PREVIEW_CHARS,
    SelectionQuoteChip,
    applyIncomingSelectionQuote,
    truncateSelectionQuotePreviewText,
} from './selection-quote-ui.js';

describe('selection-quote-ui', () => {
    it('opens the panel and shows the chip when a selection quote arrives', () => {
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
            <SelectionQuoteChip
                quote={next.draftQuote!}
                onClose={() => {}}
            />,
        );

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
    });

    it('truncates quote text in the chip preview', () => {
        const longText = 'x'.repeat(MAX_SELECTION_QUOTE_PREVIEW_CHARS + 20);
        const preview = truncateSelectionQuotePreviewText(longText);

        expect(preview.length).toBe(MAX_SELECTION_QUOTE_PREVIEW_CHARS + 1);
        expect(preview).toBe(`${'x'.repeat(MAX_SELECTION_QUOTE_PREVIEW_CHARS)}…`);

        const markup = renderToStaticMarkup(
            <SelectionQuoteChip
                quote={{ text: longText, createdAt: 333 }}
                onClose={() => {}}
            />,
        );

        expect(markup).toContain(preview);
    });
});

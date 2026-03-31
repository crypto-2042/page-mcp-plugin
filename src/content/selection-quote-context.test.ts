import { describe, expect, it } from 'vitest';
import {
    MAX_SELECTION_QUOTE_CHARS,
    buildSelectionQuoteMessages,
    truncateSelectionQuoteText,
} from './selection-quote-context.js';

describe('selection-quote-context', () => {
    it('builds a hidden system message for a draft quote', () => {
        const messages = buildSelectionQuoteMessages({
            draftQuote: { text: 'Draft quote text', createdAt: 1 },
        });

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            role: 'system',
            hidden: true,
        });
        expect(messages[0]?.content).toContain('Selected page text for this conversation turn:');
        expect(messages[0]?.content).toContain('Draft quote text');
    });

    it('builds a hidden system message for a pinned quote', () => {
        const messages = buildSelectionQuoteMessages({
            pinnedQuote: { text: 'Pinned quote text', createdAt: 1 },
        });

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            role: 'system',
            hidden: true,
        });
        expect(messages[0]?.content).toContain('Pinned selected page text for this conversation:');
        expect(messages[0]?.content).toContain('Pinned quote text');
    });

    it('truncates oversized quote text', () => {
        const longText = 'x'.repeat(MAX_SELECTION_QUOTE_CHARS + 25);

        const truncated = truncateSelectionQuoteText(longText);

        expect(truncated.length).toBe(MAX_SELECTION_QUOTE_CHARS);
        expect(truncated).toBe('x'.repeat(MAX_SELECTION_QUOTE_CHARS));
    });

    it('builds truncated quote content when the quote is oversized', () => {
        const longText = 'y'.repeat(MAX_SELECTION_QUOTE_CHARS + 25);
        const messages = buildSelectionQuoteMessages({
            draftQuote: { text: longText, createdAt: 1 },
        });

        expect(messages).toHaveLength(1);
        expect(messages[0]?.content).toContain('y'.repeat(MAX_SELECTION_QUOTE_CHARS));
        expect(messages[0]?.content).not.toContain('y'.repeat(MAX_SELECTION_QUOTE_CHARS + 1));
    });

    it('returns no messages for empty input', () => {
        expect(buildSelectionQuoteMessages({})).toEqual([]);
        expect(buildSelectionQuoteMessages({ draftQuote: undefined, pinnedQuote: undefined })).toEqual([]);
    });
});

import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../shared/types.js';
import { createSelectionQuoteDraft } from './selection-quote-ui.js';
import { buildSelectionQuotePreparedMessages } from './selection-quote-send.js';

const resourceMessage: ChatMessage = {
    id: 'msg_resource',
    role: 'system',
    content: 'Attached page resources for this conversation turn:\n\n[resource]\nresource content',
    timestamp: 1,
    hidden: true,
};

const userMessage: ChatMessage = {
    id: 'msg_user',
    role: 'user',
    content: 'User prompt',
    timestamp: 2,
};

describe('selection quote send preparation', () => {
    it('injects a draft quote for the next send only', () => {
        const draftQuote = createSelectionQuoteDraft('Draft quote text', 123);
        expect(draftQuote).not.toBeNull();

        const firstTurn = buildSelectionQuotePreparedMessages({
            draftQuote,
            pinnedQuote: null,
            baseMessages: [resourceMessage, userMessage],
        });

        expect(firstTurn.shouldClearDraftQuoteAfterCommit).toBe(true);
        expect(firstTurn.messages.map((message) => message.role)).toEqual(['system', 'system', 'user']);
        expect(firstTurn.messages[0]?.content).toContain('Selected page text for this conversation turn:');
        expect(firstTurn.messages[0]?.content).toContain('Draft quote text');
        expect(firstTurn.messages[1]).toEqual(resourceMessage);
        expect(firstTurn.messages[2]).toEqual(userMessage);

        const secondTurn = buildSelectionQuotePreparedMessages({
            draftQuote: null,
            pinnedQuote: null,
            baseMessages: [resourceMessage, userMessage],
        });

        expect(secondTurn.shouldClearDraftQuoteAfterCommit).toBe(false);
        expect(secondTurn.messages).toEqual([resourceMessage, userMessage]);
    });

    it('keeps a pinned quote across sends', () => {
        const pinnedQuote = createSelectionQuoteDraft('Pinned quote text', 456);
        expect(pinnedQuote).not.toBeNull();

        const firstTurn = buildSelectionQuotePreparedMessages({
            draftQuote: null,
            pinnedQuote,
            baseMessages: [resourceMessage, userMessage],
        });

        expect(firstTurn.shouldClearDraftQuoteAfterCommit).toBe(false);
        expect(firstTurn.messages[0]?.content).toContain('Pinned selected page text for this conversation:');
        expect(firstTurn.messages[0]?.content).toContain('Pinned quote text');

        const secondTurn = buildSelectionQuotePreparedMessages({
            draftQuote: null,
            pinnedQuote,
            baseMessages: [resourceMessage, userMessage],
        });

        expect(secondTurn.shouldClearDraftQuoteAfterCommit).toBe(false);
        expect(secondTurn.messages[0]?.content).toContain('Pinned quote text');
        expect(secondTurn.messages[1]).toEqual(resourceMessage);
        expect(secondTurn.messages[2]).toEqual(userMessage);
    });

    it('keeps quote ordering stable ahead of resource and user messages', () => {
        const draftQuote = createSelectionQuoteDraft('Draft quote text', 123);
        const pinnedQuote = createSelectionQuoteDraft('Pinned quote text', 456);

        const prepared = buildSelectionQuotePreparedMessages({
            draftQuote,
            pinnedQuote,
            baseMessages: [resourceMessage, userMessage],
        });

        expect(prepared.messages.map((message) => message.role)).toEqual(['system', 'system', 'system', 'user']);
        expect(prepared.messages[0]?.content).toContain('Draft quote text');
        expect(prepared.messages[1]?.content).toContain('Pinned quote text');
        expect(prepared.messages[2]).toEqual(resourceMessage);
        expect(prepared.messages[3]).toEqual(userMessage);
    });
});

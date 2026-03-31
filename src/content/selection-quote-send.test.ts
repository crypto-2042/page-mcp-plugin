import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../shared/types.js';
import { createSelectionQuoteDraft } from './selection-quote-ui.js';
import {
    buildSelectionQuoteConversationMessages,
    buildSelectionQuoteTurnMessages,
    shouldClearSelectionQuoteDraft,
    stripSelectionQuoteMessages,
} from './selection-quote-send.js';

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
    it('builds a draft quote as transient turn context', () => {
        const draftQuote = createSelectionQuoteDraft('Draft quote text', 123);
        expect(draftQuote).not.toBeNull();

        const firstTurn = buildSelectionQuoteTurnMessages({
            draftQuote,
            pinnedQuote: null,
        });

        expect(firstTurn).toHaveLength(1);
        expect(firstTurn[0]?.role).toBe('system');
        expect(firstTurn[0]?.content).toContain('Selected page text for this conversation turn:');
        expect(firstTurn[0]?.content).toContain('<selection_quote>');
        expect(firstTurn[0]?.content).toContain('Draft quote text');

        const secondTurn = buildSelectionQuoteTurnMessages({
            draftQuote: null,
            pinnedQuote: null,
        });

        expect(secondTurn).toEqual([]);
    });

    it('builds a pinned quote as transient turn context across sends', () => {
        const pinnedQuote = createSelectionQuoteDraft('Pinned quote text', 456);
        expect(pinnedQuote).not.toBeNull();

        const firstTurn = buildSelectionQuoteTurnMessages({
            draftQuote: null,
            pinnedQuote,
        });

        expect(firstTurn).toHaveLength(1);
        expect(firstTurn[0]?.content).toContain('Pinned selected page text for this conversation:');
        expect(firstTurn[0]?.content).toContain('<pinned_selection_quote>');
        expect(firstTurn[0]?.content).toContain('Pinned quote text');

        const secondTurn = buildSelectionQuoteTurnMessages({
            draftQuote: null,
            pinnedQuote,
        });

        expect(secondTurn).toHaveLength(1);
        expect(secondTurn[0]?.content).toContain('Pinned quote text');
    });

    it('inserts quote messages immediately before current turn messages without persisting them', () => {
        const draftQuote = createSelectionQuoteDraft('Draft quote text', 123);
        const pinnedQuote = createSelectionQuoteDraft('Pinned quote text', 456);
        const priorAssistantMessage: ChatMessage = {
            id: 'msg_assistant_prev',
            role: 'assistant',
            content: 'Previous answer',
            timestamp: 0,
        };

        const turnMessages = buildSelectionQuoteTurnMessages({
            draftQuote,
            pinnedQuote,
        });
        const requestMessages = buildSelectionQuoteConversationMessages({
            priorMessages: [priorAssistantMessage],
            quoteMessages: turnMessages,
            turnMessages: [resourceMessage, userMessage],
        });
        const persistedMessages = stripSelectionQuoteMessages(requestMessages);

        expect(requestMessages.map((message) => message.role)).toEqual(['assistant', 'system', 'system', 'system', 'user']);
        expect(requestMessages[0]).toEqual(priorAssistantMessage);
        expect(requestMessages[1]?.content).toContain('Draft quote text');
        expect(requestMessages[2]?.content).toContain('Pinned quote text');
        expect(requestMessages[3]).toEqual(resourceMessage);
        expect(requestMessages[4]).toEqual(userMessage);
        expect(persistedMessages).toEqual([priorAssistantMessage, resourceMessage, userMessage]);
    });

    it('keeps the draft quote when the prepared turn does not complete', () => {
        expect(shouldClearSelectionQuoteDraft({
            shouldClearDraftQuoteAfterCommit: true,
            turnCompleted: false,
            currentDraft: createSelectionQuoteDraft('Draft quote text', 123),
            participatingDraft: createSelectionQuoteDraft('Draft quote text', 123),
        })).toBe(false);
    });

    it('clears the draft quote only after a successful prepared turn completes', () => {
        expect(shouldClearSelectionQuoteDraft({
            shouldClearDraftQuoteAfterCommit: true,
            turnCompleted: true,
            currentDraft: createSelectionQuoteDraft('Draft quote text', 123),
            participatingDraft: createSelectionQuoteDraft('Draft quote text', 123),
        })).toBe(true);
    });

    it('preserves a replacement draft when an older send completes', () => {
        expect(shouldClearSelectionQuoteDraft({
            shouldClearDraftQuoteAfterCommit: true,
            turnCompleted: true,
            currentDraft: createSelectionQuoteDraft('Draft B', 456),
            participatingDraft: createSelectionQuoteDraft('Draft A', 123),
        })).toBe(false);
    });
});

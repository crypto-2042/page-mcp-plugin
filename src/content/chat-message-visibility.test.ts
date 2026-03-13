import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../shared/types.js';
import { filterRenderableMessages } from './chat-message-visibility.js';

describe('filterRenderableMessages', () => {
    it('excludes hidden persisted messages from the rendered chat transcript', () => {
        const messages: ChatMessage[] = [
            {
                id: 'msg-visible',
                role: 'user',
                content: 'visible message',
                timestamp: 1,
            },
            {
                id: 'msg-hidden',
                role: 'system',
                content: 'hidden resource snapshot',
                timestamp: 2,
                hidden: true,
            },
            {
                id: 'msg-visible-2',
                role: 'assistant',
                content: 'second visible message',
                timestamp: 3,
            },
        ];

        expect(filterRenderableMessages(messages).map((message) => message.id)).toEqual([
            'msg-visible',
            'msg-visible-2',
        ]);
    });
});

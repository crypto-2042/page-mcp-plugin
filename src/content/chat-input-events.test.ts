import { describe, expect, it, vi } from 'vitest';
import { stopChatInputEventPropagation } from './chat-input-events.js';

describe('stopChatInputEventPropagation', () => {
    it('stops bubbling to the page without blocking the browser default input behavior', () => {
        const stopPropagation = vi.fn();
        const stopImmediatePropagation = vi.fn();

        stopChatInputEventPropagation({
            stopPropagation,
            nativeEvent: {
                stopImmediatePropagation,
            },
        } as any);

        expect(stopPropagation).toHaveBeenCalledTimes(1);
        expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
    });
});

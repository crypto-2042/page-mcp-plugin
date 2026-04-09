import { describe, expect, it, vi } from 'vitest';
import { handleChatInputKeyDownCapture, shouldSendChatOnEnter, stopChatInputEventPropagation } from './chat-input-events.js';

describe('shouldSendChatOnEnter', () => {
    it('returns true for plain Enter', () => {
        expect(shouldSendChatOnEnter({ key: 'Enter' })).toBe(true);
    });

    it('returns false for Shift+Enter', () => {
        expect(shouldSendChatOnEnter({ key: 'Enter', shiftKey: true })).toBe(false);
    });

    it('returns false while IME composition is active', () => {
        expect(
            shouldSendChatOnEnter({
                key: 'Enter',
                nativeEvent: { isComposing: true },
            })
        ).toBe(false);
    });

    it('returns false for IME composition keyCode fallback', () => {
        expect(
            shouldSendChatOnEnter({
                key: 'Enter',
                nativeEvent: { keyCode: 229 },
            })
        ).toBe(false);
    });
});

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

describe('handleChatInputKeyDownCapture', () => {
    it('sends on plain Enter and still stops propagation', () => {
        const send = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const stopImmediatePropagation = vi.fn();

        handleChatInputKeyDownCapture({
            key: 'Enter',
            preventDefault,
            stopPropagation,
            nativeEvent: { stopImmediatePropagation },
        } as any, send);

        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledTimes(1);
        expect(stopPropagation).toHaveBeenCalledTimes(1);
        expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PMCP_SHORTCUT_EVENT, registerPageShortcutRuntimeListener } from './page-shortcut-runtime.js';

let listener: EventListener | null = null;
const addEventListener = vi.fn((type: string, nextListener: EventListenerOrEventListenerObject) => {
    if (type !== PMCP_SHORTCUT_EVENT) return;
    listener = nextListener as EventListener;
});
const removeEventListener = vi.fn((type: string, nextListener: EventListenerOrEventListenerObject) => {
    if (type !== PMCP_SHORTCUT_EVENT) return;
    if (listener === nextListener) {
        listener = null;
    }
});

const target = {
    addEventListener,
    removeEventListener,
};

beforeEach(() => {
    vi.clearAllMocks();
    listener = null;
});

describe('page shortcut runtime listener', () => {
    it('opens the panel and forwards message shortcuts', () => {
        const onMessage = vi.fn();
        const onOpenPanel = vi.fn();

        registerPageShortcutRuntimeListener({
            onMessage,
            onOpenPanel,
            target,
        });

        listener?.(new CustomEvent(PMCP_SHORTCUT_EVENT, {
            detail: { text: '总结当前页面' },
        }));

        expect(onOpenPanel).toHaveBeenCalledTimes(1);
        expect(onMessage).toHaveBeenCalledWith('总结当前页面');
    });

    it('ignores invalid shortcut payloads', () => {
        const onMessage = vi.fn();
        const onOpenPanel = vi.fn();

        registerPageShortcutRuntimeListener({
            onMessage,
            onOpenPanel,
            target,
        });

        listener?.(new CustomEvent(PMCP_SHORTCUT_EVENT, {
            detail: { text: '' },
        }));
        listener?.(new CustomEvent(PMCP_SHORTCUT_EVENT, { detail: { type: 'message' } }));

        expect(onOpenPanel).not.toHaveBeenCalled();
        expect(onMessage).not.toHaveBeenCalled();
    });

    it('removes the event listener on cleanup', () => {
        const cleanup = registerPageShortcutRuntimeListener({
            onMessage: vi.fn(),
            onOpenPanel: vi.fn(),
            target,
        });

        expect(addEventListener).toHaveBeenCalledTimes(1);
        cleanup();
        expect(removeEventListener).toHaveBeenCalledTimes(1);
        expect(listener).toBeNull();
    });
});

export const PMCP_SHORTCUT_EVENT = 'pmcp:shortcut';

export type PageShortcutDetail = { text: string };

type ShortcutEventTarget = {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
};

function isPageShortcutDetail(value: unknown): value is PageShortcutDetail {
    if (!value || typeof value !== 'object') return false;

    const detail = value as Record<string, unknown>;
    return typeof detail.text === 'string' && detail.text.trim().length > 0;
}

export function registerPageShortcutRuntimeListener(params: {
    onMessage: (text: string) => void;
    onOpenPanel: () => void;
    target?: ShortcutEventTarget;
}) {
    const target = params.target ?? window;

    const listener = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (!isPageShortcutDetail(detail)) return;

        params.onOpenPanel();
        params.onMessage(detail.text);
    };

    target.addEventListener(PMCP_SHORTCUT_EVENT, listener);

    return () => {
        target.removeEventListener(PMCP_SHORTCUT_EVENT, listener);
    };
}

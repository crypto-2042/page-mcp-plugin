import type { ConversationQuote, PluginMessage } from '../shared/types.js';
import { createSelectionQuoteDraft } from './selection-quote-ui.js';

export function registerSelectionQuoteRuntimeListener(params: {
    onQuote: (quote: ConversationQuote) => void;
    onOpenPanel: () => void;
    runtime?: Pick<typeof chrome.runtime, 'onMessage'>;
}) {
    const runtime = params.runtime ?? chrome.runtime;

    const listener = (message: PluginMessage) => {
        if (!message || typeof message !== 'object') return;
        if (message.type !== 'ADD_SELECTION_QUOTE') return;

        const draftQuote = createSelectionQuoteDraft(message.text);
        if (!draftQuote) return;

        params.onQuote(draftQuote);
        params.onOpenPanel();
    };

    runtime.onMessage.addListener(listener as Parameters<typeof runtime.onMessage.addListener>[0]);

    return () => {
        runtime.onMessage.removeListener(listener as Parameters<typeof runtime.onMessage.addListener>[0]);
    };
}

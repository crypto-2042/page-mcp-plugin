// ============================================================
// Page MCP Plugin — Safe Runtime Messaging
// ============================================================

import { isExtensionContextInvalidatedError } from './runtime-error.js';

const devWarn = (...args: unknown[]) => {
    if (import.meta.env.DEV) {
        console.warn(...args);
    }
};

let invalidated = false;

export function isRuntimeInvalidated(): boolean {
    return invalidated;
}

/**
 * Safely send a message to the extension's background service worker.
 * Silently handles extension-context-invalidated errors (e.g. after extension update).
 */
export async function safeRuntimeMessage<T>(context: string, payload: unknown): Promise<T | undefined> {
    if (invalidated) return undefined;
    try {
        return await chrome.runtime.sendMessage(payload) as T;
    } catch (error) {
        if (isExtensionContextInvalidatedError(error)) {
            invalidated = true;
            return undefined;
        }
        devWarn(`[Page MCP Content] ${context} failed:`, error);
        return undefined;
    }
}

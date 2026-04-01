import type { ToolCallInfo } from '../shared/types.js';

export function getToolCallResultPayload(call: ToolCallInfo): unknown {
    if (call.status === 'error') {
        if (call.result !== undefined) {
            return call.result;
        }
        return { error: call.error ?? 'Unknown tool error' };
    }

    return call.result ?? null;
}

function extractTextContentBlocks(content: unknown): { textContent: string | null; hasNonTextBlocks: boolean } {
    if (!Array.isArray(content)) {
        return { textContent: null, hasNonTextBlocks: false };
    }

    const textBlocks: string[] = [];
    let hasNonTextBlocks = false;

    for (const item of content) {
        if (!item || typeof item !== 'object') {
            hasNonTextBlocks = true;
            continue;
        }
        const block = item as { type?: unknown; text?: unknown };
        if (block.type === 'text' && typeof block.text === 'string') {
            textBlocks.push(block.text);
            continue;
        }
        hasNonTextBlocks = true;
    }

    return {
        textContent: textBlocks.length > 0 ? textBlocks.join('\n') : null,
        hasNonTextBlocks,
    };
}

export function getToolCallDisplaySections(call: ToolCallInfo): {
    textContent: string | null;
    structuredContent: unknown | null;
    rawPayload: unknown;
    showRawPayload: boolean;
} {
    const rawPayload = getToolCallResultPayload(call);
    if (!rawPayload || typeof rawPayload !== 'object') {
        return {
            textContent: null,
            structuredContent: null,
            rawPayload,
            showRawPayload: true,
        };
    }

    const payload = rawPayload as { content?: unknown; structuredContent?: unknown };
    const { textContent, hasNonTextBlocks } = extractTextContentBlocks(payload.content);
    const structuredContent = payload.structuredContent ?? null;

    return {
        textContent,
        structuredContent,
        rawPayload,
        showRawPayload: hasNonTextBlocks || (!textContent && !structuredContent),
    };
}

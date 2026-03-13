// ============================================================
// Page MCP Plugin — ID Generation Utilities
// ============================================================

/**
 * Generate a unique ID with the given prefix.
 * Uses timestamp + random string to avoid collisions.
 */
export function generateId(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${timestamp}_${random}`;
}

export function generateConversationId(): string {
    return generateId('conv');
}

export function generateMessageId(): string {
    return generateId('msg');
}

export function generateToolCallId(): string {
    return generateId('tool');
}

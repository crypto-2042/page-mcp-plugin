function extractTextFromContentBlocks(content: unknown): string | null {
    if (!Array.isArray(content)) return null;

    const textParts = content
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const text = (item as { text?: unknown }).text;
            return typeof text === 'string' && text.trim() ? text.trim() : null;
        })
        .filter((text): text is string => !!text);

    if (textParts.length === 0) return null;
    return textParts.join('\n');
}

function extractToolErrorMessage(result: unknown): string {
    if (typeof result === 'string' && result.trim()) return result;
    if (result && typeof result === 'object') {
        const record = result as { error?: unknown; content?: unknown };
        if (typeof record.error === 'string' && record.error.trim()) return record.error;
        const textFromContent = extractTextFromContentBlocks(record.content);
        if (textFromContent) return textFromContent;
    }
    return 'Tool execution failed';
}

function isMcpToolErrorResult(result: unknown): boolean {
    return !!result
        && typeof result === 'object'
        && (result as { isError?: unknown }).isError === true;
}

export type NormalizedToolExecutionResult = {
    status: 'success' | 'error';
    result: unknown;
    modelContent: string;
    error?: string;
};

export function buildMcpToolErrorResult(error: unknown) {
    return {
        content: [{
            type: 'text',
            text: error instanceof Error ? error.message : String(error),
        }],
        isError: true,
    } as const;
}

export function normalizeToolExecutionResult(
    result: unknown,
    formatToolResult: (result: unknown) => string,
): NormalizedToolExecutionResult {
    const modelContent = formatToolResult(result);
    if (!isMcpToolErrorResult(result)) {
        return {
            status: 'success',
            result,
            modelContent,
        };
    }

    return {
        status: 'error',
        result,
        modelContent,
        error: extractToolErrorMessage(result),
    };
}

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

function classifyToolError(message: string): {
    errorCode: string;
    retryRecommended: boolean;
    guidance?: string;
} {
    const normalized = message.toLowerCase();
    if (normalized.includes('timeout')) {
        return {
            errorCode: 'timeout',
            retryRecommended: false,
            guidance: 'Do not retry this tool call with the same arguments unless the environment changes.',
        };
    }
    if (normalized.includes('user canceled')) {
        return {
            errorCode: 'user_canceled',
            retryRecommended: false,
            guidance: 'Do not retry this tool call unless the user explicitly approves it.',
        };
    }
    if (normalized.includes('permission denied')) {
        return {
            errorCode: 'permission_denied',
            retryRecommended: false,
            guidance: 'Do not retry this tool call with the same arguments unless permissions change.',
        };
    }
    return {
        errorCode: 'tool_error',
        retryRecommended: true,
    };
}

function isMcpToolResult(result: unknown): result is { content?: unknown; structuredContent?: unknown; isError?: unknown } {
    return !!result
        && typeof result === 'object'
        && (
            Object.prototype.hasOwnProperty.call(result, 'content')
            || Object.prototype.hasOwnProperty.call(result, 'structuredContent')
            || Object.prototype.hasOwnProperty.call(result, 'isError')
        );
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
    const message = error instanceof Error ? error.message : String(error);
    const classification = classifyToolError(message);
    const text = classification.guidance
        ? `${message}. ${classification.guidance}`
        : message;

    return {
        content: [{
            type: 'text',
            text,
        }],
        structuredContent: {
            errorCode: classification.errorCode,
            retryRecommended: classification.retryRecommended,
        },
        isError: true,
    } as const;
}

export function serializeToolResultForModel(
    result: unknown,
    fallbackFormatter: (result: unknown) => string,
): string {
    if (!isMcpToolResult(result)) {
        return fallbackFormatter(result);
    }

    const textContent = extractTextFromContentBlocks(result.content);
    const structuredContent = Object.prototype.hasOwnProperty.call(result, 'structuredContent')
        ? result.structuredContent
        : undefined;
    const lines: string[] = [
        result.isError === true ? 'Tool failed.' : 'Tool succeeded.',
    ];

    if (textContent) {
        lines.push('');
        lines.push(result.isError === true ? 'Error:' : 'Summary:');
        lines.push(textContent);
    }

    if (structuredContent !== undefined) {
        lines.push('');
        lines.push('Structured result:');
        lines.push(JSON.stringify(structuredContent, null, 2));
    }

    if (lines.length === 1) {
        return fallbackFormatter(result);
    }

    return lines.join('\n');
}

export function normalizeToolExecutionResult(
    result: unknown,
    formatToolResult: (result: unknown) => string,
): NormalizedToolExecutionResult {
    const modelContent = serializeToolResultForModel(result, formatToolResult);
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

import DOMPurify from 'dompurify';
import TurndownService from 'turndown';

const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
});

function fallbackStringify(result: unknown): string {
    try {
        return JSON.stringify(result, null, 2);
    } catch {
        return String(result);
    }
}

function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
    }) as string;
}

function extractHtmlFromDomField(domValue: unknown): string | null {
    if (typeof domValue === 'string') return domValue;
    if (domValue && typeof domValue === 'object') {
        const maybeOuterHtml = (domValue as { outerHTML?: unknown }).outerHTML;
        if (typeof maybeOuterHtml === 'string') return maybeOuterHtml;
    }
    return null;
}

export function schemaHasDomField(outputSchema: unknown): boolean {
    if (!outputSchema || typeof outputSchema !== 'object') return false;
    const schema = outputSchema as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(schema, 'dom')) return true;
    const properties = schema.properties;
    if (properties && typeof properties === 'object') {
        return Object.prototype.hasOwnProperty.call(properties, 'dom');
    }
    return false;
}

export function formatToolResult(result: unknown, outputSchema?: unknown): string {
    const resultRecord = (result && typeof result === 'object') ? (result as Record<string, unknown>) : null;
    const shouldTryDomMarkdown = schemaHasDomField(outputSchema) || !!(resultRecord && Object.prototype.hasOwnProperty.call(resultRecord, 'dom'));
    if (!shouldTryDomMarkdown || !resultRecord) return fallbackStringify(result);

    const html = extractHtmlFromDomField(resultRecord.dom);
    if (!html) return fallbackStringify(result);

    try {
        const cleanHtml = sanitizeHtml(html).trim();
        if (!cleanHtml) return fallbackStringify(result);
        return turndown.turndown(cleanHtml);
    } catch {
        return fallbackStringify(result);
    }
}

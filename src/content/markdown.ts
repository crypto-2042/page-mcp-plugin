// ============================================================
// Page MCP Plugin — Markdown Renderer (Secure)
// ============================================================
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const RAW_URL_START_RE = /https?:\/\//g;
const RAW_URL_CHAR_RE = /[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/;
const URL_BOUNDARY_RE = /[\s)\]}>,.!?:;，。！？：；、]/;
const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
};

type LinkToken =
    | { kind: 'link'; text: string; url: string }
    | { kind: 'text'; text: string };

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

function sanitizeHtml(html: string): string {
    const purify = DOMPurify as unknown as { sanitize?: (input: string, config?: Record<string, unknown>) => string };
    if (typeof purify.sanitize !== 'function') {
        return html;
    }

    return purify.sanitize(html, {
        USE_PROFILES: { html: true },
        ALLOWED_TAGS: [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'ul', 'ol',
            'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
            'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'span'
        ],
        ALLOWED_ATTR: ['class', 'data-url']
    });
}

function trimTrailingSeparators(candidate: string): { url: string; trailing: string } {
    let end = candidate.length;
    while (end > 0 && URL_BOUNDARY_RE.test(candidate[end - 1] || '')) {
        end -= 1;
    }

    return {
        url: candidate.slice(0, end),
        trailing: candidate.slice(end)
    };
}

function parseRawUrl(text: string, start: number): { original: string; url: string; recognized: boolean; nextIndex: number } | null {
    let index = start;
    while (index < text.length && RAW_URL_CHAR_RE.test(text[index] || '')) {
        index += 1;
    }

    const original = text.slice(start, index);
    if (!original) return null;

    const { url, trailing } = trimTrailingSeparators(original);
    const nextChar = text[index] ?? '';
    const boundaryChar = trailing ? trailing[0] : nextChar;
    const recognized = !!url && (!boundaryChar || URL_BOUNDARY_RE.test(boundaryChar));

    return {
        original,
        url,
        recognized,
        nextIndex: index
    };
}

function buildTokenizedMarkdown(text: string): { markdown: string; tokenMap: Map<string, LinkToken> } {
    const tokenMap = new Map<string, LinkToken>();
    let tokenCounter = 0;
    let cursor = 0;
    let output = '';
    let match: RegExpExecArray | null;

    RAW_URL_START_RE.lastIndex = 0;
    while ((match = RAW_URL_START_RE.exec(text)) !== null) {
        const start = match.index;
        output += text.slice(cursor, start);

        if (text.slice(Math.max(0, start - 2), start) === '](') {
            const passthrough = parseRawUrl(text, start);
            if (passthrough) {
                output += text.slice(start, passthrough.nextIndex);
                cursor = passthrough.nextIndex;
                RAW_URL_START_RE.lastIndex = cursor;
                continue;
            }
        }

        const parsed = parseRawUrl(text, start);
        if (!parsed) {
            output += text[start];
            cursor = start + 1;
            RAW_URL_START_RE.lastIndex = cursor;
            continue;
        }

        const token = `PMCP_LINK_TOKEN_${tokenCounter++}`;
        tokenMap.set(token, parsed.recognized
            ? { kind: 'link', text: parsed.url, url: parsed.url }
            : { kind: 'text', text: parsed.original });
        output += token;
        cursor = parsed.nextIndex;
        RAW_URL_START_RE.lastIndex = cursor;
    }

    output += text.slice(cursor);
    return { markdown: output, tokenMap };
}

function renderLinkLike(text: string, url: string): string {
    return `<span class="pmcp-link-like" data-url="${escapeHtml(url)}">${escapeHtml(text)}</span>`;
}

function restoreRawUrlTokens(html: string, tokenMap: Map<string, LinkToken>): string {
    let nextHtml = html;
    for (const [token, value] of tokenMap.entries()) {
        const replacement = value.kind === 'link'
            ? renderLinkLike(value.text, value.url)
            : escapeHtml(value.text);
        nextHtml = nextHtml.split(token).join(replacement);
    }
    return nextHtml;
}

function replaceAnchorsWithLinkLike(html: string): string {
    return html.replace(/<a\b[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g, (_match, href: string, label: string) => {
        const cleanHref = escapeHtml(href);
        return `<span class="pmcp-link-like" data-url="${cleanHref}">${label}</span>`;
    });
}

/**
 * Render markdown safely to HTML.
 */
export function renderMarkdown(text: string): string {
    if (!text) return '';

    try {
        const { markdown, tokenMap } = buildTokenizedMarkdown(text);
        const rawHtml = marked.parse(markdown) as string;
        const restoredHtml = restoreRawUrlTokens(rawHtml, tokenMap);
        const linkSafeHtml = replaceAnchorsWithLinkLike(restoredHtml);

        return sanitizeHtml(linkSafeHtml);
    } catch (err) {
        console.error('Markdown rendering error:', err);
        // Fallback to safe plain text on error
        return escapeHtml(text);
    }
}

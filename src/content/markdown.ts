// ============================================================
// Page MCP Plugin — Markdown Renderer (Secure)
// ============================================================
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Render markdown safely to HTML.
 */
export function renderMarkdown(text: string): string {
    if (!text) return '';

    try {
        const rawHtml = marked.parse(text) as string;

        // Sanitize the HTML before returning to prevent XSS
        const cleanHtml = DOMPurify.sanitize(rawHtml, {
            USE_PROFILES: { html: true },
            ALLOWED_TAGS: [
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
                'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
                'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'span'
            ],
            ALLOWED_ATTR: ['href', 'title', 'class', 'target', 'rel']
        });

        return cleanHtml;
    } catch (err) {
        console.error('Markdown rendering error:', err);
        // Fallback to safe plain text on error
        return DOMPurify.sanitize(text);
    }
}

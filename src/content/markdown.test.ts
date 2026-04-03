import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.js';

describe('renderMarkdown', () => {
    it('renders standalone raw URLs as non-clickable link-like markup', () => {
        const html = renderMarkdown('Visit https://example.com now');

        expect(html).toContain('class="pmcp-link-like"');
        expect(html).toContain('data-url="https://example.com"');
        expect(html).toContain('>https://example.com<');
        expect(html).not.toContain('<a ');
        expect(html).not.toContain('href=');
    });

    it('does not treat adjacent trailing text as part of a raw URL', () => {
        const html = renderMarkdown('Visit https://example.com后续文字');

        expect(html).not.toContain('pmcp-link-like');
        expect(html).toContain('https://example.com后续文字');
    });

    it('only styles the URL portion when a space follows it', () => {
        const html = renderMarkdown('Visit https://example.com next');

        expect(html).toContain('<span class="pmcp-link-like" data-url="https://example.com">https://example.com</span> next');
    });

    it('only styles the URL portion when punctuation separates it from following text', () => {
        const html = renderMarkdown('Visit https://example.com，后续文字');

        expect(html).toContain('<span class="pmcp-link-like" data-url="https://example.com">https://example.com</span>，后续文字');
    });

    it('converts markdown links into non-clickable link-like markup', () => {
        const html = renderMarkdown('[site](https://example.com)');

        expect(html).toContain('<span class="pmcp-link-like" data-url="https://example.com">site</span>');
        expect(html).not.toContain('<a ');
        expect(html).not.toContain('href=');
    });
});

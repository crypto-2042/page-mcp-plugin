import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InitTool } from './init-tool.js';
import { pickBestInitTool } from './init-tool.js';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('pickBestInitTool', () => {
    it('prefers the most specific matching init tool over a global fallback', () => {
        const tools: InitTool[] = [
            { name: 'init' },
            { name: 'init', path: '^/docs/.*$' },
            { name: 'init', path: '^/docs/guides/intro$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/guides/intro',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/guides/intro$' });
    });

    it('prefers the longer matching explicit path over a shorter one', () => {
        const tools: InitTool[] = [
            { name: 'init', path: '^/docs/.*$' },
            { name: 'init', path: '^/docs/guides/.*$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/guides/intro',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/guides/.*$' });
    });

    it('prefers the candidate with more non-wildcard characters when path lengths tie', () => {
        const tools: InitTool[] = [
            { name: 'init', path: '^/docs/a.c$' },
            { name: 'init', path: '^/docs/abc$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/abc',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/abc$' });
    });

    it('treats more explicit character classes as more specific than ranges when path lengths tie', () => {
        const tools: InitTool[] = [
            { name: 'init', path: '^/docs/[a-c]$' },
            { name: 'init', path: '^/docs/[abc]$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/a',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/[abc]$' });
    });

    it('prefers the longer matching explicit path even when it is broader', () => {
        const tools: InitTool[] = [
            { name: 'init', path: '^/docs/[a-c][a-c][a-c]$' },
            { name: 'init', path: '^/docs/abc$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/abc',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/[a-c][a-c][a-c]$' });
    });

    it('counts grouped literal characters toward specificity when path lengths tie', () => {
        const tools: InitTool[] = [
            { name: 'init', path: '^/docs/(abc)$' },
            { name: 'init', path: '^/docs/(a.c)$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/abc',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/(abc)$' });
    });

    it('counts escaped literal metacharacters as non-wildcard characters', () => {
        const escapedLiteral = { name: 'init', path: '^/docs/a\\.c$' };
        const tools: InitTool[] = [
            { name: 'init', path: '^/docs/a.?c$' },
            escapedLiteral,
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/a.c',
            tools,
        });

        expect(selected).toBe(escapedLiteral);
    });

    it('counts escaped identity literals as non-wildcard characters', () => {
        const tools: InitTool[] = [
            { name: 'init', path: '^/docs/\\a$' },
            { name: 'init', path: '^/docs/a$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/a',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/\\a$' });
    });

    it('does not count non-capturing group prefixes as literal characters when path lengths tie', () => {
        const tools: InitTool[] = [
            { name: 'init', path: '^/docs/aa(?:)?$' },
            { name: 'init', path: '^/docs/(?:aa)$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/aa',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/aa(?:)?$' });
    });

    it('does not treat shorthand escapes as literal characters when path lengths tie', () => {
        const tools: InitTool[] = [
            { name: 'init', path: '^/docs/\\d\\d3$' },
            { name: 'init', path: '^/docs/(123)$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/123',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/(123)$' });
    });

    it('does not count quantifier bodies toward specificity', () => {
        const tools: InitTool[] = [
            { name: 'init', path: '^/docs/a{2}$' },
            { name: 'init', path: '^/docs/ab$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/aa',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/a{2}$' });
    });

    it('does not count bounded quantifier bodies toward specificity when path lengths tie', () => {
        const tools: InitTool[] = [
            { name: 'init', path: '^/docs/a{2,3}$' },
            { name: 'init', path: '^/docs/(?:aa)$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/aa',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/(?:aa)$' });
    });

    it('counts classic unicode escapes as one literal character', () => {
        const tools: InitTool[] = [
            { name: 'init', path: '^/docs/\\u0041$' },
            { name: 'init', path: '^/docs/A$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/A',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/\\u0041$' });
    });

    it('skips invalid init tool regexes and warns once', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const selected = pickBestInitTool({
            pathname: '/docs',
            tools: [
                { name: 'init', path: '[' },
                { name: 'init' },
            ] satisfies InitTool[],
        });

        expect(selected).toEqual({ name: 'init' });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain('init');
    });

    it('ignores tools that are not init tools', () => {
        const selected = pickBestInitTool({
            pathname: '/docs',
            tools: [
                { name: 'start', path: '^/docs$' },
                { name: 'init', path: '^/docs$' },
            ] satisfies InitTool[],
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs$' });
    });

    it('keeps discovery order when candidates tie on specificity', () => {
        const first = { name: 'init', path: '^/docs/.*$' };
        const second = { name: 'init', path: '^/docs/.*$' };
        const tools: InitTool[] = [first, second];

        const selected = pickBestInitTool({
            pathname: '/docs/guide',
            tools,
        });

        expect(selected).toBe(first);
    });
});

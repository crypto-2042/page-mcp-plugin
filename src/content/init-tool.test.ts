import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InitTool } from './init-tool.js';
import { countInitToolLiteralChars, pickBestInitTool, runInitTool } from './init-tool.js';

vi.mock('./remote-tool-executor.js', () => ({
    executeRemoteToolInPage: vi.fn(),
}));

import { executeRemoteToolInPage } from './remote-tool-executor.js';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('runInitTool', () => {
    it('no-ops for null tools', async () => {
        await expect(runInitTool({ tool: null, timeoutMs: 1234 })).resolves.toBeUndefined();
        expect(executeRemoteToolInPage).not.toHaveBeenCalled();
    });

    it('executes remote init tools with empty args', async () => {
        const executeStr = '(args) => args';

        await expect(runInitTool({
            tool: { sourceType: 'remote', execute: executeStr } as any,
            timeoutMs: 4321,
        })).resolves.toBeUndefined();

        expect(executeRemoteToolInPage).toHaveBeenCalledWith(executeStr, {}, 4321);
    });

    it('skips remote init tools without a non-empty execute string', async () => {
        await expect(runInitTool({
            tool: { sourceType: 'remote', execute: '   ' } as any,
            timeoutMs: 4321,
        })).resolves.toBeUndefined();

        expect(executeRemoteToolInPage).not.toHaveBeenCalled();
    });

    it('warns but does not throw when remote execution fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.mocked(executeRemoteToolInPage).mockRejectedValueOnce(new Error('remote exploded'));

        await expect(runInitTool({
            tool: { sourceType: 'remote', execute: '(args) => args' } as any,
            timeoutMs: 4321,
        })).resolves.toBeUndefined();

        expect(warn).toHaveBeenCalledWith('[init-tool]', expect.any(Error));
    });
});

describe('countInitToolLiteralChars', () => {
    it('counts JS identity escapes Q and E as literal characters', () => {
        expect(countInitToolLiteralChars('\\Q')).toBe(1);
        expect(countInitToolLiteralChars('\\E')).toBe(1);
    });

    it('counts brace-form unicode escapes in non-u regex mode without treating them as code points', () => {
        expect(countInitToolLiteralChars('\\u{61}')).toBe(1);
    });

    it('counts malformed x escapes as identity escapes', () => {
        expect(countInitToolLiteralChars('\\xg')).toBe(2);
        expect(countInitToolLiteralChars('\\x1')).toBe(2);
    });

    it('ignores payloads for property and named backreference escapes', () => {
        expect(countInitToolLiteralChars('\\p{Lu}')).toBe(0);
        expect(countInitToolLiteralChars('\\P{Lu}')).toBe(0);
        expect(countInitToolLiteralChars('\\k<name>')).toBe(0);
    });

    it('counts escaped hyphens as literal characters inside and outside character classes', () => {
        expect(countInitToolLiteralChars('\\-')).toBe(1);
        expect(countInitToolLiteralChars('[\\-]')).toBe(1);
    });

    it('counts non-quantifier braces as literal characters', () => {
        expect(countInitToolLiteralChars('a{b}')).toBe(4);
    });

    it('does not count lookahead or lookbehind bodies toward specificity', () => {
        expect(countInitToolLiteralChars('^a(?=bc)bc(?:)()$')).toBe(3);
        expect(countInitToolLiteralChars('^a(?<=bc)bc(?:)()$')).toBe(3);
    });

    it('counts hyphens as literal characters only at the start or end of a character class', () => {
        expect(countInitToolLiteralChars('[-a]')).toBe(2);
        expect(countInitToolLiteralChars('[a-]')).toBe(2);
        expect(countInitToolLiteralChars('[a-b]')).toBe(2);
    });
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

    it('treats an empty path the same as a missing path fallback', () => {
        const fallback = { name: 'init' };
        const tools: InitTool[] = [
            fallback,
            { name: 'init', path: '' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/intro',
            tools,
        });

        expect(selected).toBe(fallback);
    });

    it('keeps discovery order when malformed x escapes tie with a wildcard path', () => {
        const escaped = { name: 'init', path: '^/docs/\\xg$' };
        const tools: InitTool[] = [
            escaped,
            { name: 'init', path: '^/docs/x.g$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/xg',
            tools,
        });

        expect(selected).toBe(escaped);
    });

    it('prefers the tool with fewer literal payload chars when property escape payloads would otherwise win', () => {
        const escaped = { name: 'init', path: '^/docs/\\p{Lu}a$' };
        const tools: InitTool[] = [
            escaped,
            { name: 'init', path: '^/docs/p.{4}\\a$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/p{Lu}a',
            tools,
        });

        expect(selected).toEqual({ name: 'init', path: '^/docs/p.{4}\\a$' });
    });

    it('prefers literal braces over wildcard dots when path lengths tie', () => {
        const braceTool = { name: 'init', path: '^/docs/a{b}$' };
        const tools: InitTool[] = [
            braceTool,
            { name: 'init', path: '^/docs/a..$' },
        ];

        const selected = pickBestInitTool({
            pathname: '/docs/a{b}',
            tools,
        });

        expect(selected).toBe(braceTool);
    });

    it('keeps discovery order when a lookahead body would otherwise win on literal count', () => {
        const fallback = { name: 'init', path: '^abc(?:)()()(?:)$' };
        const tools: InitTool[] = [
            fallback,
            { name: 'init', path: '^a(?=bc)bc(?:)()$' },
        ];

        const selected = pickBestInitTool({
            pathname: 'abc',
            tools,
        });

        expect(selected).toBe(fallback);
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

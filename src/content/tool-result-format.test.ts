import { describe, expect, it, vi } from 'vitest';

const { sanitizeMock, turndownMock, TurndownServiceMock } = vi.hoisted(() => {
    const sanitizeMockInner = vi.fn((html: string) => html);
    const turndownMockInner = vi.fn((html: string) => `md:${html}`);
    const TurndownServiceMockInner = vi.fn().mockImplementation(() => ({
        turndown: turndownMockInner,
    }));
    return {
        sanitizeMock: sanitizeMockInner,
        turndownMock: turndownMockInner,
        TurndownServiceMock: TurndownServiceMockInner,
    };
});

vi.mock('dompurify', () => ({
    default: {
        sanitize: sanitizeMock,
    },
}));

vi.mock('turndown', () => ({
    default: TurndownServiceMock,
}));

import { formatToolResult, schemaHasDomField } from './tool-result-format';

describe('tool result markdown formatting', () => {
    it('detects dom field in output schema top level or properties', () => {
        expect(schemaHasDomField({ dom: { type: 'string' } })).toBe(true);
        expect(schemaHasDomField({ type: 'object', properties: { dom: { type: 'string' } } })).toBe(true);
        expect(schemaHasDomField({ type: 'object', properties: { html: { type: 'string' } } })).toBe(false);
        expect(schemaHasDomField(undefined)).toBe(false);
    });

    it('converts result.dom html string to markdown when schema indicates dom', () => {
        const result = formatToolResult({ dom: '<div><h1>Hi</h1></div>' }, { type: 'object', properties: { dom: { type: 'string' } } });

        expect(sanitizeMock).toHaveBeenCalledWith('<div><h1>Hi</h1></div>', expect.any(Object));
        expect(turndownMock).toHaveBeenCalledWith('<div><h1>Hi</h1></div>');
        expect(result).toBe('md:<div><h1>Hi</h1></div>');
    });

    it('converts when result contains dom field even without schema', () => {
        const result = formatToolResult({ dom: '<p>Hello</p>' });
        expect(result).toBe('md:<p>Hello</p>');
    });

    it('falls back to json when dom is absent', () => {
        const payload = { ok: true, value: 1 };
        const result = formatToolResult(payload, { type: 'object', properties: { html: { type: 'string' } } });

        expect(result).toBe(JSON.stringify(payload, null, 2));
    });

    it('falls back to json when sanitized dom is empty', () => {
        sanitizeMock.mockReturnValueOnce('');

        const payload = { dom: '<script>alert(1)</script>', ok: 1 };
        const result = formatToolResult(payload, { type: 'object', properties: { dom: { type: 'string' } } });

        expect(result).toBe(JSON.stringify(payload, null, 2));
        expect(turndownMock).not.toHaveBeenCalledWith('');
    });
});

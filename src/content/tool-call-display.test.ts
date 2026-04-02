import { describe, expect, it } from 'vitest';
import { formatToolCallDuration, getToolCallDisplaySections, getToolCallHeaderClassNames, getToolCallResultPayload, getToolCallStatusLabel } from './tool-call-display.js';

describe('getToolCallResultPayload', () => {
    it('returns the tool result for successful calls', () => {
        expect(getToolCallResultPayload({
            id: 'call_1',
            name: 'read_page',
            args: { selector: 'title' },
            status: 'success',
            result: { title: 'Hello' },
        })).toEqual({ title: 'Hello' });
    });

    it('wraps tool errors into a result payload object', () => {
        expect(getToolCallResultPayload({
            id: 'call_1',
            name: 'read_page',
            args: { selector: 'title' },
            status: 'error',
            error: 'selector missing',
        })).toEqual({ error: 'selector missing' });
    });

    it('prefers the normalized error result payload when available', () => {
        expect(getToolCallResultPayload({
            id: 'call_1',
            name: 'read_page',
            args: { selector: 'title' },
            status: 'error',
            error: 'selector missing',
            result: {
                content: [{ type: 'text', text: 'selector missing' }],
                isError: true,
            },
        })).toEqual({
            content: [{ type: 'text', text: 'selector missing' }],
            isError: true,
        });
    });

    it('extracts content text blocks and structured content into separate display sections', () => {
        expect(getToolCallDisplaySections({
            id: 'call_1',
            name: 'read_page',
            args: { selector: 'title' },
            status: 'success',
            result: {
                content: [
                    { type: 'text', text: 'first line' },
                    { type: 'resource', uri: 'mcp://resource/1' },
                    { type: 'text', text: 'second line' },
                ],
                structuredContent: {
                    title: 'Hello',
                },
            },
        })).toEqual({
            textContent: 'first line\nsecond line',
            structuredContent: { title: 'Hello' },
            rawPayload: {
                content: [
                    { type: 'text', text: 'first line' },
                    { type: 'resource', uri: 'mcp://resource/1' },
                    { type: 'text', text: 'second line' },
                ],
                structuredContent: {
                    title: 'Hello',
                },
            },
            showRawPayload: true,
        });
    });

    it('falls back to raw payload when no text blocks or structured content are available', () => {
        expect(getToolCallDisplaySections({
            id: 'call_1',
            name: 'read_page',
            args: { selector: 'title' },
            status: 'success',
            result: { value: 1 },
        })).toEqual({
            textContent: null,
            structuredContent: null,
            rawPayload: { value: 1 },
            showRawPayload: true,
        });
    });
});

describe('tool call display helpers', () => {
    it('formats duration in milliseconds for short tool calls', () => {
        expect(formatToolCallDuration(450)).toBe('450ms');
    });

    it('formats duration in seconds for longer tool calls', () => {
        expect(formatToolCallDuration(1450)).toBe('1.5s');
    });

    it('returns the user-facing status labels', () => {
        expect(getToolCallStatusLabel('pending')).toBe('pending');
        expect(getToolCallStatusLabel('success')).toBe('success');
        expect(getToolCallStatusLabel('error')).toBe('failed');
    });

    it('returns non-shrinking meta classes and truncating name classes for the header layout', () => {
        expect(getToolCallHeaderClassNames()).toEqual({
            name: 'pmcp-tool-name pmcp-tool-name-truncate',
            meta: 'pmcp-tool-header-right pmcp-tool-header-meta-fixed',
        });
    });
});

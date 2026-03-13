import { describe, expect, it } from 'vitest';
import { getToolCallResultPayload } from './tool-call-display.js';

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
});

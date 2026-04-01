import { describe, expect, it } from 'vitest';
import { normalizeToolExecutionResult } from './tool-result-normalizer.js';

describe('normalizeToolExecutionResult', () => {
    it('keeps ordinary tool results as successful results', () => {
        expect(
            normalizeToolExecutionResult({ content: [{ type: 'text', text: 'ok' }] }, (result) => JSON.stringify(result)),
        ).toEqual({
            status: 'success',
            error: undefined,
            modelContent: JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }),
            result: { content: [{ type: 'text', text: 'ok' }] },
        });
    });

    it('treats MCP isError results as tool execution failures', () => {
        const rawResult = {
            content: [
                { type: 'text', text: 'API rate limit exceeded' },
            ],
            isError: true,
        };

        expect(
            normalizeToolExecutionResult(rawResult, (result) => JSON.stringify(result)),
        ).toEqual({
            status: 'error',
            error: 'API rate limit exceeded',
            modelContent: JSON.stringify(rawResult),
            result: rawResult,
        });
    });
});

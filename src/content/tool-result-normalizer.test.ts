import { describe, expect, it } from 'vitest';
import { normalizeToolExecutionResult, serializeToolResultForModel } from './tool-result-normalizer.js';

describe('normalizeToolExecutionResult', () => {
    it('keeps ordinary tool results as successful results', () => {
        expect(
            normalizeToolExecutionResult({ content: [{ type: 'text', text: 'ok' }] }, (result) => JSON.stringify(result)),
        ).toEqual({
            status: 'success',
            error: undefined,
            modelContent: 'Tool succeeded.\n\nSummary:\nok',
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
            modelContent: 'Tool failed.\n\nError:\nAPI rate limit exceeded',
            result: rawResult,
        });
    });

    it('serializes structured MCP success results for the model with summary and JSON', () => {
        expect(
            serializeToolResultForModel(
                {
                    content: [{ type: 'text', text: 'Found 2 products' }],
                    structuredContent: { products: [{ id: 1 }, { id: 2 }] },
                },
                (result) => JSON.stringify(result),
            ),
        ).toBe([
            'Tool succeeded.',
            '',
            'Summary:',
            'Found 2 products',
            '',
            'Structured result:',
            '{',
            '  "products": [',
            '    {',
            '      "id": 1',
            '    },',
            '    {',
            '      "id": 2',
            '    }',
            '  ]',
            '}',
        ].join('\n'));
    });

    it('serializes MCP error results for the model with error text and structured details', () => {
        expect(
            serializeToolResultForModel(
                {
                    content: [{ type: 'text', text: 'API rate limit exceeded' }],
                    structuredContent: { retryAfter: 30 },
                    isError: true,
                },
                (result) => JSON.stringify(result),
            ),
        ).toBe([
            'Tool failed.',
            '',
            'Error:',
            'API rate limit exceeded',
            '',
            'Structured result:',
            '{',
            '  "retryAfter": 30',
            '}',
        ].join('\n'));
    });

    it('preserves non-retryable guidance for timeout-style tool errors', () => {
        expect(
            serializeToolResultForModel(
                {
                    content: [{
                        type: 'text',
                        text: 'Remote tool execution timeout after 30000ms. Do not retry this tool call with the same arguments unless the environment changes.',
                    }],
                    structuredContent: {
                        errorCode: 'timeout',
                        retryRecommended: false,
                    },
                    isError: true,
                },
                (result) => JSON.stringify(result),
            ),
        ).toContain('Do not retry this tool call with the same arguments');
    });
});

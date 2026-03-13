import { describe, expect, it } from 'vitest';
import { buildQuickActionCandidates } from './quick-actions.js';

describe('buildQuickActionCandidates', () => {
    it('returns only the first three prompt shortcuts without required arguments', () => {
        const out = buildQuickActionCandidates({
            prompts: [
                { name: 'prompt-a', description: 'Prompt A' } as any,
                { name: 'prompt-b', description: 'Prompt B' } as any,
                { name: 'prompt-c', description: 'Prompt C' } as any,
                { name: 'prompt-d', description: 'Prompt D' } as any,
                { name: 'needs-input', description: 'Needs input', arguments: [{ name: 'q', required: true }] } as any,
            ],
            tools: [
                { name: 'tool-a', description: 'Tool A' } as any,
            ],
            resources: [
                { uri: 'page://title', name: 'Title', description: 'Title' } as any,
            ],
        });

        expect(out.map((item) => item.key)).toEqual([
            'prompt:prompt-a',
            'prompt:prompt-b',
            'prompt:prompt-c',
        ]);
    });

    it('filters out prompt with required arguments', () => {
        const out = buildQuickActionCandidates({
            prompts: [
                { name: 'required-prompt', description: 'x', arguments: [{ name: 'q', required: true }] } as any,
                { name: 'optional-prompt', description: 'x', arguments: [{ name: 'q', required: false }] } as any,
                { name: 'plain-prompt', description: 'x' } as any,
            ],
            tools: [],
            resources: [],
        });
        expect(out.map((item) => item.key)).toEqual([
            'prompt:optional-prompt',
            'prompt:plain-prompt',
        ]);
    });

    it('ignores tools even when they have no required schema fields', () => {
        const out = buildQuickActionCandidates({
            prompts: [],
            tools: [
                { name: 'needs-input', description: 'x', inputSchema: { type: 'object', required: ['id'] } } as any,
                { name: 'no-input', description: 'x', inputSchema: { type: 'object' } } as any,
            ],
            resources: [],
        });
        expect(out).toEqual([]);
    });

    it('ignores resources even when they have no template parameters', () => {
        const out = buildQuickActionCandidates({
            prompts: [],
            tools: [],
            resources: [
                { name: 'repo', description: 'x', uri: 'repo://{owner}/{name}' } as any,
                { name: 'readme', description: 'x', uri: 'repo://readme' } as any,
            ],
        });
        expect(out).toEqual([]);
    });

    it('supports prompt manifest schema filtering', () => {
        const out = buildQuickActionCandidates({
            prompts: [
                { name: 'remote-prompt', description: 'x', manifest: { inputSchema: { required: ['q'] } } } as any,
                { name: 'remote-prompt-ok', description: 'x', manifest: { prompt: 'hello' } } as any,
            ],
            tools: [],
            resources: [],
        });
        expect(out.map((item) => item.key)).toEqual(['prompt:remote-prompt-ok']);
    });

    it('builds quick actions from mcp prompts only', () => {
        const out = buildQuickActionCandidates({
            prompts: [{ name: 'prompt-a', description: 'Prompt A' } as any],
            tools: [{ name: 'tool-a', description: 'Tool A' } as any],
            resources: [{ uri: 'page://title', name: 'Title', description: 'Page title' } as any],
        });

        expect(out.map((item) => item.key)).toEqual(['prompt:prompt-a']);
    });
});

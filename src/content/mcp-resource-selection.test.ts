import { describe, expect, it } from 'vitest';
import {
    getInitialAttachedResourceUris,
    getSelectedResourceCountLabel,
    toggleAttachedResourceUri,
} from './mcp-resource-selection.js';

describe('mcp-resource-selection', () => {
    it('keeps only attached resource uris that exist in the current resource list', () => {
        const uris = getInitialAttachedResourceUris(
            [
                { uri: 'page://title', name: 'Title' },
                { uri: 'page://summary', name: 'Summary' },
            ] as any,
            ['page://title', 'page://missing']
        );

        expect(uris).toEqual(['page://title']);
    });

    it('toggles the selected resource uri on and off', () => {
        expect(toggleAttachedResourceUri([], 'page://title')).toEqual(['page://title']);
        expect(toggleAttachedResourceUri(['page://title'], 'page://title')).toEqual([]);
    });

    it('builds a badge label from the selected resource count', () => {
        expect(getSelectedResourceCountLabel([])).toBeNull();
        expect(getSelectedResourceCountLabel(['page://title'])).toBe('1');
        expect(getSelectedResourceCountLabel(['page://title', 'page://summary'])).toBe('2');
    });
});

import { describe, expect, it } from 'vitest';
import { buildAttachedResourceMessages } from './mcp-resources.js';

describe('buildAttachedResourceMessages', () => {
    it('reads selected resources and converts them into hidden context messages', async () => {
        const messages = await buildAttachedResourceMessages({
            selectedUris: ['page://title'],
            resources: [{ uri: 'page://title', name: 'Title', description: 'Page title' }] as any,
            readResource: async () => ({
                contents: [{ uri: 'page://title', mimeType: 'text/plain', text: 'Hello page' }],
            }),
        });

        expect(messages).toHaveLength(1);
        expect(messages[0]?.role).toBe('system');
        expect(messages[0]?.hidden).toBe(true);
        expect(messages[0]?.content).toContain('Attached page resources for this conversation turn');
        expect(messages[0]?.content).toContain('Hello page');
    });

    it('skips missing or unreadable resources', async () => {
        const messages = await buildAttachedResourceMessages({
            selectedUris: ['page://missing', 'page://title'],
            resources: [{ uri: 'page://title', name: 'Title', description: 'Page title' }] as any,
            readResource: async (uri: string) => {
                if (uri === 'page://missing') throw new Error('missing');
                return { contents: [{ uri, mimeType: 'text/plain', text: 'Visible text' }] };
            },
        });

        expect(messages).toHaveLength(1);
        expect(messages[0]?.content).toContain('Visible text');
        expect(messages[0]?.content).not.toContain('missing');
    });
});

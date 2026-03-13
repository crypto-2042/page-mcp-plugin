import { describe, expect, it } from 'vitest';
import { collectRemoteRepositoryContent, getLocalRepositoryContent, mergeMcpBuckets, mergeWithSourceLabels, shouldLoadRemoteRepositories, tagRemoteContent } from './remote-content.js';

describe('remote merge', () => {
    it('adds source labels to every item', () => {
        const out = mergeWithSourceLabels(
            {
                tools: [{ name: 'native-tool', itemType: 'tool' } as any],
                prompts: [],
                resources: [],
                skills: [{ name: 'native-skill' } as any],
            },
            tagRemoteContent({
                tools: [{ name: 'remote-tool', description: 'd', itemType: 'tool' }],
                prompts: [],
                resources: [],
                skills: [{ name: 'remote-skill', description: 'd', version: '1.0.0', skillMd: '# hi' }],
            }, 'repo-1', 'market.example')
        );

        expect(out.tools[0].sourceLabel).toBe('native');
        expect(out.tools[1].sourceLabel).toBe('remote:market.example');
        expect(out.skills[0].sourceLabel).toBe('native');
        expect(out.skills[1].sourceLabel).toBe('remote:market.example');
    });

    it('keeps repository-backed loading disabled in the mcp-only content path', () => {
        expect(shouldLoadRemoteRepositories({ remoteLoadingEnabled: true })).toBe(false);
        expect(shouldLoadRemoteRepositories({ remoteLoadingEnabled: false })).toBe(false);
    });

    it('reads repository content from install snapshot and filters by regex pathPattern', () => {
        const content = getLocalRepositoryContent({
            installSnapshot: {
                snapshot: {
                    mcp: [
                        { name: 'match-tool', itemType: 'tool', pathPattern: '^/products/.*$', manifest: {} },
                        { name: 'skip-tool', itemType: 'tool', pathPattern: '^/orders/.*$', manifest: {} },
                    ],
                    skills: [
                        { name: 'match-skill', version: '1.0.0', skillMd: '# x', pathPattern: '^/products/.*$' },
                        { name: 'skip-skill', version: '1.0.0', skillMd: '# x', pathPattern: '^/orders/.*$' },
                    ],
                },
            },
        } as any, '/products/iphone');
        expect(content.tools.map((x) => x.name)).toEqual(['match-tool']);
        expect(content.skills.map((x) => x.name)).toEqual(['match-skill']);
    });

    it('merges bucket arrays without mixed capability arrays', () => {
        const merged = mergeMcpBuckets(
            { tools: [{ name: 'a' }], prompts: [], resources: [] },
            { tools: [{ name: 'b' }], prompts: [{ name: 'p' }], resources: [] }
        );

        expect(merged.tools.map((item) => item.name)).toEqual(['a', 'b']);
        expect(merged.prompts.map((item) => item.name)).toEqual(['p']);
    });

    it('collects matched repository content for a page', () => {
        const content = collectRemoteRepositoryContent([
            {
                repositoryId: 'repo-1',
                marketOrigin: 'https://market.example',
                enabled: true,
                siteDomain: 'shop.example.com',
                installSnapshot: {
                    snapshot: {
                        mcp: [{ name: 'remote-tool', itemType: 'tool', pathPattern: '^/products/.*$', manifest: {} }],
                        skills: [],
                    },
                },
            },
            {
                repositoryId: 'repo-2',
                marketOrigin: 'https://market.example',
                enabled: true,
                siteDomain: 'other.example.com',
                installSnapshot: {
                    snapshot: { mcp: [{ name: 'skip-tool', itemType: 'tool', pathPattern: '^/products/.*$', manifest: {} }], skills: [] },
                },
            },
        ] as any[], 'shop.example.com', '/products/iphone');

        expect(content.tools.map((item) => item.name)).toEqual(['remote-tool']);
    });

});

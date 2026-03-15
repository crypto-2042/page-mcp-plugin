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

    it('reads repository content from install snapshot and filters by regex path', () => {
        const content = getLocalRepositoryContent({
            installSnapshot: {
                snapshot: {
                    mcp: {
                        tools: [
                            { name: 'match-tool', path: '^/products/.*$' },
                            { name: 'skip-tool', path: '^/orders/.*$' },
                        ],
                        prompts: [],
                        resources: [],
                    },
                    skills: [
                        { name: 'match-skill', version: '1.0.0', skillMd: '# x', path: '^/products/.*$' },
                        { name: 'skip-skill', version: '1.0.0', skillMd: '# x', path: '^/orders/.*$' },
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
                        mcp: {
                            tools: [{ name: 'remote-tool', path: '^/products/.*$' }],
                            prompts: [],
                            resources: [],
                        },
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
                    snapshot: {
                        mcp: {
                            tools: [{ name: 'skip-tool', path: '^/products/.*$' }],
                            prompts: [],
                            resources: [],
                        },
                        skills: [],
                    },
                },
            },
        ] as any[], 'shop.example.com', '/products/iphone');

        expect(content.tools.map((item) => item.name)).toEqual(['remote-tool']);
    });

});

import { describe, expect, it } from 'vitest';
import { validateExternalInstall } from './background-install.js';

const installSnapshot = {
    repository: {
        id: 'repo-id',
        name: 'repo',
        description: null,
        siteDomain: 'example.com',
        author: { id: 'a1', name: 'author' },
        starsCount: 0,
        usageCount: 0,
        lastActiveAt: null,
        latestReleaseVersion: '1.0.0',
    },
    release: {
        id: 'rel-1',
        repositoryId: 'repo-id',
        version: '1.0.0',
        name: null,
        changelog: null,
        isLatest: true,
        createdAt: '2026-01-01T00:00:00.000Z',
    },
    snapshot: {
        mcp: [],
        skills: [],
    },
    integrity: {
        algorithm: 'sha256',
        digest: 'abc',
    },
};

describe('external install validation', () => {
    it('rejects non-whitelisted market origin', () => {
        const result = validateExternalInstall('https://evil.example', {
            repositoryId: 'r1',
            repositoryName: 'Repo',
            siteDomain: 'example.com',
            release: '1.0.0',
            apiBase: 'https://api.market.example',
            marketOrigin: 'https://market.example',
            marketDetailUrl: 'https://market.example/repo/r1',
            installSnapshot,
        }, ['https://market.example']);
        expect(result.ok).toBe(false);
    });

    it('accepts sender origin when it is in configured whitelist', () => {
        const result = validateExternalInstall('http://localhost:5173', {
            repositoryId: 'r1',
            repositoryName: 'Repo',
            siteDomain: 'example.com',
            release: '1.0.0',
            apiBase: 'https://api.market.example',
            marketOrigin: 'http://localhost:5173',
            marketDetailUrl: 'http://localhost:5173/repo/r1',
            installSnapshot,
        }, ['https://market.page-mcp.org', 'http://localhost:5173']);
        expect(result.ok).toBe(true);
    });

    it('accepts minimal installSnapshot when only snapshot.mcp/skills are provided', () => {
        const result = validateExternalInstall('http://localhost:5173', {
            repositoryId: 'r1',
            repositoryName: 'Repo',
            siteDomain: 'example.com',
            release: '1.0.0',
            apiBase: 'https://api.market.example',
            marketOrigin: 'http://localhost:5173',
            marketDetailUrl: 'http://localhost:5173/repo/r1',
            installSnapshot: {
                snapshot: {
                    mcp: [],
                    skills: [],
                },
            },
        }, ['http://localhost:5173']);
        expect(result.ok).toBe(true);
    });

    it('accepts protocol-first mcp buckets directly on installSnapshot', () => {
        const result = validateExternalInstall('http://localhost:5173', {
            repositoryId: 'r1',
            repositoryName: 'Repo',
            siteDomain: 'example.com',
            release: '1.0.0',
            apiBase: 'https://api.market.example',
            marketOrigin: 'http://localhost:5173',
            marketDetailUrl: 'http://localhost:5173/repo/r1',
            installSnapshot: {
                mcp: {
                    tools: [{ name: 'tool-a', description: 'Tool A' }],
                    prompts: [],
                    resources: [],
                },
            },
        }, ['http://localhost:5173']);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.payload.mcp?.tools[0]?.name).toBe('tool-a');
        }
    });

    it('accepts installSnapshot when market sends json string payload', () => {
        const result = validateExternalInstall('http://localhost:5173', {
            repositoryId: 'r1',
            repositoryName: 'Repo',
            siteDomain: 'example.com',
            release: '1.0.0',
            apiBase: 'https://api.market.example',
            marketOrigin: 'http://localhost:5173',
            marketDetailUrl: 'http://localhost:5173/repo/r1',
            installSnapshot: JSON.stringify({
                snapshot: {
                    mcp: [],
                    skills: [],
                },
            }),
        }, ['http://localhost:5173']);
        expect(result.ok).toBe(true);
    });

    it('rejects payload without installSnapshot', () => {
        const result = validateExternalInstall('http://localhost:5173', {
            repositoryId: 'r1',
            repositoryName: 'Repo',
            siteDomain: 'example.com',
            release: '1.0.0',
            apiBase: 'https://api.market.example',
            marketOrigin: 'http://localhost:5173',
            marketDetailUrl: 'http://localhost:5173/repo/r1',
        }, ['http://localhost:5173']);
        expect(result.ok).toBe(false);
    });
});

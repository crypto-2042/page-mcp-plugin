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
        mcp: { tools: [], prompts: [], resources: [] },
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
                    mcp: { tools: [], prompts: [], resources: [] },
                    skills: [],
                },
            },
        }, ['http://localhost:5173']);
        expect(result.ok).toBe(true);
    });

    it('accepts mcp bucket directly on installSnapshot (no snapshot wrapper)', () => {
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
                    mcp: { tools: [], prompts: [], resources: [] },
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

    it('accepts full API response format: snapshot.mcp is an object with tools/prompts/resources', () => {
        // This is the shape returned by GET /api/v1/repositories/:id/install
        const result = validateExternalInstall('http://localhost:5173', {
            repositoryId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            repositoryName: 'github-repo-mcp',
            siteDomain: 'github.com',
            release: '2.0.0',
            apiBase: 'http://localhost:3000/api/v1',
            marketOrigin: 'http://localhost:5173',
            marketDetailUrl: 'http://localhost:5173/repo/github-repo-mcp',
            installSnapshot: {
                repository: {
                    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
                    name: 'github-repo-mcp',
                    description: 'Page MCP for GitHub repository detail pages.',
                    siteDomain: 'github.com',
                    author: { id: '4db11474-1b78-4b0e-94ba-b9f6397c663c', name: 'crypto-2042' },
                    starsCount: 88,
                    usageCount: 260,
                    lastActiveAt: '2026-03-11T20:44:09.723Z',
                    latestReleaseVersion: '2.0.0',
                },
                release: {
                    id: '17c3500e-d315-4dc5-ae10-abac2255e5e8',
                    repositoryId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
                    version: '2.0.0',
                    name: 'synced',
                    changelog: 'Synced from crypto-2042/github-assistant@main',
                    isLatest: true,
                    createdAt: '2026-03-14T09:57:32.551Z',
                },
                snapshot: {
                    mcp: {
                        tools: [{ name: 'get-readme', description: 'Extract the README content.', inputSchema: {}, execute: '(() => {})()' }],
                        prompts: [{ name: 'explain-readme', description: 'Explain the README.', arguments: [] }],
                        resources: [{ name: 'project_name', uri: 'page://xpath//strong', mimeType: 'text/plain' }],
                    },
                    skills: [],
                },
                integrity: { algorithm: 'sha256', digest: 'abc123' },
            },
        }, ['http://localhost:5173']);
        expect(result.ok).toBe(true);
        if (result.ok) {
            // mcp StoredMcpSnapshot should be populated from snapshot.mcp object
            expect(result.payload.mcp?.tools[0]?.name).toBe('get-readme');
            expect(result.payload.mcp?.prompts[0]?.name).toBe('explain-readme');
            expect(result.payload.mcp?.resources[0]?.name).toBe('project_name');
            // installSnapshot.repository should be preserved
            expect(result.payload.installSnapshot.repository.id).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc');
            // installSnapshot.snapshot.mcp should remain as an object (original structure preserved)
            const snap = result.payload.installSnapshot.snapshot as any;
            expect(snap.mcp.tools[0].name).toBe('get-readme');
        }
    });
});


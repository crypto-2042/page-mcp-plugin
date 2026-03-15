import { describe, expect, it } from 'vitest';
import {
    buildRepoKey,
    normalizeDomain,
    normalizeInstalledRepo,
    normalizeOrigin,
    upsertInstalledRepo,
} from './remote-repos.js';
import type { InstalledRemoteRepository, StoredMcpSnapshot } from './types.js';

const installSnapshot = {
    repository: {
        id: 'repo-1',
        name: 'Repo One',
        description: null,
        siteDomain: 'shop.example.com',
        author: { id: 'author-1', name: 'Author' },
        starsCount: 0,
        usageCount: 0,
        lastActiveAt: null,
        latestReleaseVersion: '1.0.0',
    },
    release: {
        id: 'rel-1',
        repositoryId: 'repo-1',
        version: '1.0.0',
        name: null,
        changelog: null,
        isLatest: true,
        createdAt: '2026-01-01T00:00:00.000Z',
    },
    snapshot: { mcp: { tools: [], prompts: [], resources: [] }, skills: [] },
    integrity: { algorithm: 'sha256', digest: 'abc' },
};

const baseRepo: InstalledRemoteRepository = {
    id: 'repo_repo-1|shop.example.com|https://market-a.example',
    repositoryId: 'repo-1',
    repositoryName: 'Repo One',
    siteDomain: 'shop.example.com',
    release: '1.0.0',
    apiBase: 'https://api.market-a.example',
    marketOrigin: 'https://market-a.example',
    marketDetailUrl: 'https://market-a.example/repo/repo-1',
    mcp: { tools: [], prompts: [], resources: [] },
    installSnapshot: installSnapshot as any,
    enabled: true,
    installedAt: 1,
    updatedAt: 1,
};

describe('remote repo model', () => {
    it('uses protocol-first mcp buckets for stored snapshots', () => {
        const snapshot: StoredMcpSnapshot = { tools: [], prompts: [], resources: [] };
        expect(Object.keys(snapshot)).toEqual(['tools', 'prompts', 'resources']);
    });

    it('normalizes domain and origin in key', () => {
        expect(buildRepoKey('repo1', 'Example.com', 'HTTPS://Market.Example/')).toBe(
            'repo1|example.com|https://market.example'
        );
    });

    it('upserts by repositoryId+siteDomain+marketOrigin', () => {
        const now = 1700000000000;
        const list: InstalledRemoteRepository[] = [];
        const first = upsertInstalledRepo(
            list,
            {
                repositoryId: 'repo-1',
                repositoryName: 'Repo One',
                siteDomain: 'Shop.Example.com',
                release: '1.0.0',
                apiBase: 'https://api.market-a.example',
                marketOrigin: 'https://market-a.example',
                marketDetailUrl: 'https://market-a.example/repo/repo-1',
                installSnapshot,
            },
            now
        );
        expect(first).toHaveLength(1);
        expect(first[0]?.release).toBe('1.0.0');
        expect(first[0]?.mcp).toEqual({ tools: [], prompts: [], resources: [] });

        const second = upsertInstalledRepo(
            first,
            {
                repositoryId: 'repo-1',
                repositoryName: 'Repo One Updated',
                siteDomain: 'shop.example.com',
                release: '1.1.0',
                apiBase: 'https://api.market-a.example',
                marketOrigin: 'https://market-a.example/',
                marketDetailUrl: 'https://market-a.example/repo/repo-1?v=2',
                installSnapshot,
            },
            now + 1
        );
        expect(second).toHaveLength(1);
        expect(second[0]?.release).toBe('1.1.0');
        expect(second[0]?.repositoryName).toBe('Repo One Updated');
        expect(second[0]?.installedAt).toBe(now);
        expect(second[0]?.updatedAt).toBe(now + 1);
    });

    it('normalizes helpers', () => {
        expect(normalizeDomain('WWW.Example.Com')).toBe('www.example.com');
        expect(normalizeOrigin('https://Market.Example/abc/def?x=1')).toBe('https://market.example');
    });

    it('snapshot.mcp is used directly as StoredMcpSnapshot — no conversion needed', () => {
        const mcp: StoredMcpSnapshot = {
            tools: [{ name: 'tool-a', description: 'Tool A' }],
            prompts: [{ name: 'prompt-a' }],
            resources: [{ uri: 'page://selector/a', name: 'resource-a' }],
        };
        const normalized = normalizeInstalledRepo({
            id: 'repo_repo-1|example.com|https://market.example',
            repositoryId: 'repo-1',
            repositoryName: 'Repo One',
            siteDomain: 'example.com',
            release: '1.0.0',
            apiBase: 'https://api.market.example',
            marketOrigin: 'https://market.example',
            marketDetailUrl: 'https://market.example/repo/repo-1',
            installSnapshot: {
                ...installSnapshot,
                snapshot: { mcp, skills: [] },
            },
            enabled: true,
            installedAt: 1,
            updatedAt: 1,
        } as unknown as InstalledRemoteRepository);

        expect(normalized.mcp.tools[0]?.name).toBe('tool-a');
        expect(normalized.mcp.prompts[0]?.name).toBe('prompt-a');
        expect(normalized.mcp.resources[0]?.name).toBe('resource-a');
    });

    it('hydrates missing mcp buckets from install snapshot data', () => {
        const normalized = normalizeInstalledRepo({
            id: 'repo_repo-1|shop.example.com|https://market-a.example',
            repositoryId: 'repo-1',
            repositoryName: 'Repo One',
            siteDomain: 'shop.example.com',
            release: '1.0.0',
            apiBase: 'https://api.market-a.example',
            marketOrigin: 'https://market-a.example',
            marketDetailUrl: 'https://market-a.example/repo/repo-1',
            installSnapshot,
            enabled: true,
            installedAt: 1,
            updatedAt: 1,
        } as unknown as InstalledRemoteRepository);

        expect(normalized.mcp.tools).toHaveLength(0);
        expect(normalized.mcp.prompts).toHaveLength(0);
        expect(normalized.mcp.resources).toHaveLength(0);
    });

    it('preserves allowWithoutConfirm flag', () => {
        const normalized = normalizeInstalledRepo({
            ...baseRepo,
            allowWithoutConfirm: true,
        });
        expect(normalized.allowWithoutConfirm).toBe(true);
    });

    it('defaults allowWithoutConfirm to false when missing', () => {
        const normalized = normalizeInstalledRepo(baseRepo);
        expect(normalized.allowWithoutConfirm).toBe(false);
    });
});

import { describe, expect, it } from 'vitest';
import { deleteMcpSkillsRepoById, toggleMcpSkillsRepoEnabled, upsertMcpSkillsRepo } from './background-mcp-skills-repos.js';

const makeRepo = (overrides: Record<string, unknown> = {}) => ({
    id: 'repo_repo-1|shop.example.com|https://manual.local',
    repositoryId: 'repo-1',
    repositoryName: 'Manual Repo',
    siteDomain: 'shop.example.com',
    release: '1.0.0',
    apiBase: 'https://api.manual.local',
    marketOrigin: 'https://manual.local',
    marketDetailUrl: 'https://manual.local/repo/repo-1',
    installSnapshot: {
        repository: {
            id: 'repo-1',
            name: 'Manual Repo',
            description: null,
            siteDomain: 'shop.example.com',
            author: { id: 'local', name: 'Local' },
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
        snapshot: { mcp: [], skills: [] },
        integrity: { algorithm: 'sha256', digest: 'abc' },
    },
    mcp: { tools: [], prompts: [], resources: [] },
    enabled: true,
    installedAt: 1,
    updatedAt: 1,
    ...overrides,
}) as any;

describe('background mcp/skills repo helpers', () => {
    it('creates new repo when id does not exist', () => {
        const now = 100;
        const next = upsertMcpSkillsRepo([], makeRepo({ id: '' }), now);
        expect(next).toHaveLength(1);
        expect(next[0].id.startsWith('repo_')).toBe(true);
        expect(next[0].mcp).toEqual({ tools: [], prompts: [], resources: [] });
        expect(next[0].installedAt).toBe(now);
        expect(next[0].updatedAt).toBe(now);
    });

    it('updates existing repo by id', () => {
        const list = [makeRepo({ id: 'manual-1', installedAt: 10, updatedAt: 10 })];
        const next = upsertMcpSkillsRepo(list, makeRepo({ id: 'manual-1', repositoryName: 'Updated' }), 20);
        expect(next).toHaveLength(1);
        expect(next[0].repositoryName).toBe('Updated');
        expect(next[0].installedAt).toBe(10);
        expect(next[0].updatedAt).toBe(20);
    });

    it('toggles and deletes repo', () => {
        const list = [makeRepo({ id: 'manual-1' }), makeRepo({ id: 'manual-2' })];
        const toggled = toggleMcpSkillsRepoEnabled(list, 'manual-2', false, 50);
        expect(toggled[1].enabled).toBe(false);
        expect(toggled[1].updatedAt).toBe(50);

        const deleted = deleteMcpSkillsRepoById(toggled, 'manual-1');
        expect(deleted.map((x: any) => x.id)).toEqual(['manual-2']);
    });
});

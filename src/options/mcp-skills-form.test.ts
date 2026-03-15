import { describe, expect, it } from 'vitest';
import type { McpSkillsRepository } from '../shared/types.js';
import {
    buildRepositoryPayloadFromForm,
    getEmptyFormState,
    parseRepositoryToFormState,
    type PromptForm,
    type SkillItemForm,
    type ToolForm,
} from './mcp-skills-form.js';

describe('mcp skills local form mapping', () => {
    it('builds local repository payload with fixed local fields and uuid id', () => {
        const form = getEmptyFormState();
        form.repositoryName = 'Local Repo';
        form.siteDomain = 'Shop.Example.com';
        form.tools = [{ id: 't1', name: 'toolA', description: 'd', path: '', execute: 'return 1;' }];

        const payload = buildRepositoryPayloadFromForm(form, null, 100, () => 'uuid-1');

        expect(payload.repositoryId).toBe('uuid-1');
        expect(payload.release).toBe('local');
        expect(payload.marketOrigin).toBe('local://mcp-skills');
        expect(payload.marketDetailUrl).toBe('');
        expect(payload.apiBase).toBe('');
        expect(payload.siteDomain).toBe('shop.example.com');
        expect(payload.mcp.tools).toHaveLength(1);
        expect(payload.mcp.tools[0]?.name).toBe('toolA');
        expect(payload.installSnapshot.snapshot.mcp.tools).toHaveLength(1);
        expect((payload.installSnapshot.snapshot.mcp.tools[0] as any)?.path).toBe('.*');
    });

    it('keeps existing repository identity when editing', () => {
        const existing = {
            id: 'repo_old',
            repositoryId: 'repo-fixed',
            repositoryName: 'Old',
            siteDomain: 'example.com',
            release: 'local',
            apiBase: '',
            marketOrigin: 'local://mcp-skills',
            marketDetailUrl: '',
            mcp: {
                tools: [{ name: 'tool-x', description: 'tool desc' }],
                prompts: [{ name: 'prompt-x', description: 'prompt desc' }],
                resources: [{ uri: 'page://resource-x', name: 'resource-x', description: 'resource desc' }],
            },
            installSnapshot: {
                repository: {
                    id: 'repo-fixed',
                    name: 'Old',
                    description: null,
                    siteDomain: 'example.com',
                    author: { id: 'local', name: 'Local Author' },
                    starsCount: 0,
                    usageCount: 0,
                    lastActiveAt: null,
                    latestReleaseVersion: 'local',
                },
                release: {
                    id: 'local-release',
                    repositoryId: 'repo-fixed',
                    version: 'local',
                    name: null,
                    changelog: null,
                    isLatest: true,
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
                snapshot: { mcp: { tools: [], prompts: [], resources: [] }, skills: [] },
                integrity: { algorithm: 'manual', digest: 'manual' },
            },
            enabled: true,
            installedAt: 1,
            updatedAt: 1,
        } as McpSkillsRepository;

        const form = getEmptyFormState();
        form.repositoryName = 'New Name';
        form.siteDomain = 'example.com';
        const payload = buildRepositoryPayloadFromForm(form, existing, 200, () => 'uuid-not-used');

        expect(payload.id).toBe('repo_old');
        expect(payload.repositoryId).toBe('repo-fixed');
        expect(payload.installedAt).toBe(1);
        expect(payload.updatedAt).toBe(200);
    });

    it('parses existing mcp/skills snapshots into minimal form lists', () => {
        const repo = {
            id: 'repo_x',
            repositoryId: 'repo-x',
            repositoryName: 'Repo X',
            siteDomain: 'x.com',
            release: 'local',
            apiBase: '',
            marketOrigin: 'local://mcp-skills',
            marketDetailUrl: '',
            mcp: {
                tools: [{ name: 'tool-x', description: 'd1', execute: '() => 1', path: '^/x$' }],
                prompts: [{ name: 'prompt-x', description: 'd2', messages: [{ role: 'user', content: { type: 'text', text: 'hello' } }], path: '^/p$' }],
                resources: [{ uri: 'page://resource-x', name: 'resource-x', description: 'd3', mimeType: 'text/plain', path: '^/r$' }],
            },
            installSnapshot: {
                repository: {
                    id: 'repo-x',
                    name: 'Repo X',
                    description: null,
                    siteDomain: 'x.com',
                    author: { id: 'local', name: 'Local Author' },
                    starsCount: 0,
                    usageCount: 0,
                    lastActiveAt: null,
                    latestReleaseVersion: 'local',
                },
                release: {
                    id: 'local-release',
                    repositoryId: 'repo-x',
                    version: 'local',
                    name: null,
                    changelog: null,
                    isLatest: true,
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
                snapshot: {
                    mcp: { tools: [], prompts: [], resources: [] },
                    skills: [
                        { name: 'S', description: 'sd', version: 'local', skillMd: '# S', run: 'return {}', path: '^/s$' },
                    ],
                },
                integrity: { algorithm: 'manual', digest: 'manual' },
            },
            enabled: true,
            installedAt: 1,
            updatedAt: 1,
        } as McpSkillsRepository;

        const form = parseRepositoryToFormState(repo);

        expect(form.repositoryName).toBe('Repo X');
        expect(form.siteDomain).toBe('x.com');
        expect(form.tools).toHaveLength(1);
        expect(form.prompts).toHaveLength(1);
        expect(form.resources).toHaveLength(1);
        expect(form.skills).toHaveLength(1);
        expect((form.tools[0] as ToolForm).name).toBe('tool-x');
        expect((form.tools[0] as ToolForm).execute).toBe('() => 1');
        expect((form.prompts[0] as PromptForm).prompt).toBe('hello');
        expect(form.resources[0]?.uri).toBe('page://resource-x');
        expect((form.skills[0] as SkillItemForm).skillMd).toBe('# S');
    });

    it('serializes prompt form into messages', () => {
        const form = getEmptyFormState();
        form.repositoryName = 'Local Repo';
        form.siteDomain = 'example.com';
        form.prompts = [{ id: 'p1', name: 'promptA', description: '', path: '.*', prompt: 'hi' }];

        const payload = buildRepositoryPayloadFromForm(form, null, 100, () => 'uuid-2');

        expect(payload.mcp.prompts).toHaveLength(1);
        expect((payload.mcp.prompts[0] as any).messages[0].content.text).toBe('hi');
    });
});

import { describe, expect, it } from 'vitest';
import type { McpSkillsRepository } from '../shared/types.js';
import {
    buildRepositoryPayloadFromForm,
    getEmptyFormState,
    parseRepositoryToFormState,
    buildSchemaNodeSummary,
    parseEnumValuesText,
    type PromptForm,
    type SkillItemForm,
    type ToolForm,
} from './mcp-skills-form.js';

describe('mcp skills local form mapping', () => {
    it('builds local repository payload with fixed local fields and uuid id', () => {
        const form = getEmptyFormState();
        form.repositoryName = 'Local Repo';
        form.siteDomain = 'Shop.Example.com';
        form.tools = [{ id: 't1', name: 'toolA', description: 'd', path: '', execute: 'return 1;', inputSchemaFields: [] }];

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
                tools: [{
                    name: 'tool-x',
                    description: 'd1',
                    execute: '() => 1',
                    path: '^/x$',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            selector: { type: 'string', description: 'CSS selector' },
                            limit: { type: 'integer' },
                        },
                        required: ['selector'],
                    },
                } as any],
                prompts: [{
                    name: 'prompt-x',
                    description: 'd2',
                    messages: [{ role: 'user', content: { type: 'text', text: 'hello' } }],
                    path: '^/p$',
                    arguments: [{ name: 'tone', description: 'response tone', required: true }],
                } as any],
                resources: [{ uri: 'page://resource-x', name: 'resource-x', description: 'd3', mimeType: 'text/plain', path: '^/r$' } as any],
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
        expect((form.tools[0] as ToolForm).inputSchemaFields).toHaveLength(2);
        expect((form.tools[0] as ToolForm).inputSchemaFields[0]?.name).toBe('selector');
        expect((form.tools[0] as ToolForm).inputSchemaFields[0]?.required).toBe(true);
        expect((form.tools[0] as ToolForm).inputSchemaFields[0]?.enumValues).toEqual([]);
        expect((form.prompts[0] as PromptForm).prompt).toBe('hello');
        expect((form.prompts[0] as PromptForm).arguments).toHaveLength(1);
        expect((form.prompts[0] as PromptForm).arguments[0]?.name).toBe('tone');
        expect(form.resources[0]?.uri).toBe('page://resource-x');
        expect((form.skills[0] as SkillItemForm).skillMd).toBe('# S');
    });

    it('serializes prompt form into messages', () => {
        const form = getEmptyFormState();
        form.repositoryName = 'Local Repo';
        form.siteDomain = 'example.com';
        form.prompts = [{ id: 'p1', name: 'promptA', description: '', path: '.*', prompt: 'hi', arguments: [] }];

        const payload = buildRepositoryPayloadFromForm(form, null, 100, () => 'uuid-2');

        expect(payload.mcp.prompts).toHaveLength(1);
        expect((payload.mcp.prompts[0] as any).messages[0].content.text).toBe('hi');
    });

    it('serializes tool input schema and prompt arguments from form rows', () => {
        const form = getEmptyFormState();
        form.repositoryName = 'Local Repo';
        form.siteDomain = 'example.com';
        form.tools = [{
            id: 't1',
            name: 'extract_data',
            description: '',
            path: '.*',
            execute: '() => {}',
            inputSchemaFields: [
                { id: 'f1', name: 'selector', description: 'CSS selector', type: 'string', required: true, enumValues: [], properties: [], items: null },
                { id: 'f2', name: 'maxItems', description: '', type: 'integer', required: false, enumValues: [], properties: [], items: null },
            ],
        }];
        form.prompts = [{
            id: 'p1',
            name: 'summarize',
            description: '',
            path: '.*',
            prompt: 'summarize this',
            arguments: [
                { id: 'a1', name: 'lang', description: 'target language', required: true },
                { id: 'a2', name: 'style', description: '', required: false },
            ],
        }];

        const payload = buildRepositoryPayloadFromForm(form, null, 100, () => 'uuid-3');

        expect((payload.mcp.tools[0] as any).inputSchema).toEqual({
            type: 'object',
            properties: {
                selector: { type: 'string', description: 'CSS selector' },
                maxItems: { type: 'integer' },
            },
            required: ['selector'],
        });
        expect((payload.mcp.prompts[0] as any).arguments).toEqual([
            { name: 'lang', description: 'target language', required: true },
            { name: 'style' },
        ]);
    });

    it('parses nested object/array schemas and enum values into recursive form nodes', () => {
        const repo = {
            id: 'repo_nested',
            repositoryId: 'repo-nested',
            repositoryName: 'Nested Repo',
            siteDomain: 'nested.example.com',
            release: 'local',
            apiBase: '',
            marketOrigin: 'local://mcp-skills',
            marketDetailUrl: '',
            mcp: {
                tools: [{
                    name: 'search',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            sort: { type: 'string', enum: ['asc', 'desc'] },
                            filters: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        field: { type: 'string' },
                                        op: { type: 'string', enum: ['eq', 'in'] },
                                    },
                                    required: ['field'],
                                },
                            },
                        },
                        required: ['sort'],
                    },
                } as any],
                prompts: [],
                resources: [],
            },
            installSnapshot: {
                repository: { id: 'repo-nested', name: 'Nested Repo', description: null, siteDomain: 'nested.example.com', author: { id: 'local', name: 'Local Author' }, starsCount: 0, usageCount: 0, lastActiveAt: null, latestReleaseVersion: 'local' },
                release: { id: 'local-release', repositoryId: 'repo-nested', version: 'local', name: null, changelog: null, isLatest: true, createdAt: '2026-01-01T00:00:00.000Z' },
                snapshot: { mcp: { tools: [], prompts: [], resources: [] }, skills: [] },
                integrity: { algorithm: 'manual', digest: 'manual' },
            },
            enabled: true,
            installedAt: 1,
            updatedAt: 1,
        } as McpSkillsRepository;

        const form = parseRepositoryToFormState(repo);
        const sortField = form.tools[0]!.inputSchemaFields.find((item) => item.name === 'sort')!;
        const filtersField = form.tools[0]!.inputSchemaFields.find((item) => item.name === 'filters')!;

        expect(sortField.enumValues).toEqual(['asc', 'desc']);
        expect(filtersField.type).toBe('array');
        expect(filtersField.items?.type).toBe('object');
        expect(filtersField.items?.properties.map((item) => item.name)).toEqual(['field', 'op']);
        expect(filtersField.items?.properties.find((item) => item.name === 'op')?.enumValues).toEqual(['eq', 'in']);
    });

    it('serializes nested object/array schemas and enums from recursive form nodes', () => {
        const form = getEmptyFormState();
        form.repositoryName = 'Nested Repo';
        form.siteDomain = 'nested.example.com';
        form.tools = [{
            id: 't1',
            name: 'search',
            description: '',
            path: '.*',
            execute: '() => {}',
            inputSchemaFields: [
                {
                    id: 'f1',
                    name: 'sort',
                    description: '',
                    type: 'string',
                    required: true,
                    enumValues: ['asc', 'desc'],
                    properties: [],
                    items: null,
                },
                {
                    id: 'f2',
                    name: 'filters',
                    description: 'filters to apply',
                    type: 'array',
                    required: false,
                    enumValues: [],
                    properties: [],
                    items: {
                        id: 'f2_item',
                        name: '',
                        description: '',
                        type: 'object',
                        required: false,
                        enumValues: [],
                        properties: [
                            { id: 'f2_item_1', name: 'field', description: '', type: 'string', required: true, enumValues: [], properties: [], items: null },
                            { id: 'f2_item_2', name: 'op', description: '', type: 'string', required: false, enumValues: ['eq', 'in'], properties: [], items: null },
                        ],
                        items: null,
                    },
                },
            ],
        }];

        const payload = buildRepositoryPayloadFromForm(form, null, 100, () => 'uuid-4');

        expect((payload.mcp.tools[0] as any).inputSchema).toEqual({
            type: 'object',
            properties: {
                sort: { type: 'string', enum: ['asc', 'desc'] },
                filters: {
                    type: 'array',
                    description: 'filters to apply',
                    items: {
                        type: 'object',
                        properties: {
                            field: { type: 'string' },
                            op: { type: 'string', enum: ['eq', 'in'] },
                        },
                        required: ['field'],
                    },
                },
            },
            required: ['sort'],
        });
    });

    it('parses enum textarea input into trimmed tag values', () => {
        expect(parseEnumValuesText(' asc \n\ndesc\n  in-progress  ')).toEqual(['asc', 'desc', 'in-progress']);
    });

    it('builds compact summaries for recursive schema nodes', () => {
        expect(buildSchemaNodeSummary({
            id: 'o1',
            name: 'filters',
            description: '',
            type: 'object',
            required: false,
            enumValues: [],
            properties: [
                { id: 'p1', name: 'field', description: '', type: 'string', required: true, enumValues: [], properties: [], items: null },
                { id: 'p2', name: 'op', description: '', type: 'string', required: false, enumValues: ['eq', 'in'], properties: [], items: null },
            ],
            items: null,
        })).toBe('object · 2 properties');

        expect(buildSchemaNodeSummary({
            id: 'a1',
            name: 'filters',
            description: '',
            type: 'array',
            required: false,
            enumValues: [],
            properties: [],
            items: {
                id: 'i1',
                name: '',
                description: '',
                type: 'object',
                required: false,
                enumValues: [],
                properties: [],
                items: null,
            },
        })).toBe('array · item: object');

        expect(buildSchemaNodeSummary({
            id: 'e1',
            name: 'sort',
            description: '',
            type: 'string',
            required: true,
            enumValues: ['asc', 'desc'],
            properties: [],
            items: null,
        })).toBe('string · enum(2)');
    });
});

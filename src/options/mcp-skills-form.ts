import type { McpSkillsRepository, SnapshotMcpItem, SnapshotSkillItem, StoredMcpPrompt, StoredMcpResource, StoredMcpTool } from '../shared/types.js';

export type McpKind = 'tool' | 'prompt' | 'resource';

export type McpItemForm = {
    id: string;
    kind: McpKind;
    name: string;
    description: string;
    pathPattern: string;
    execute: string;
    prompt: string;
    content: string;
};

export type SkillItemForm = {
    id: string;
    name: string;
    description: string;
    pathPattern: string;
    skillMd: string;
    run: string;
};

export type McpSkillsFormState = {
    repositoryName: string;
    repositoryDescription: string;
    siteDomain: string;
    tools: McpItemForm[];
    prompts: McpItemForm[];
    resources: McpItemForm[];
    skills: SkillItemForm[];
};

function generateRowId(prefix: string, index: number): string {
    return `${prefix}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePathPattern(pathPattern: string): string {
    return pathPattern.trim() || '.*';
}

function normalizeDomain(input: string): string {
    return input.trim().toLowerCase();
}

function newMcpForm(kind: McpKind, index: number): McpItemForm {
    return {
        id: generateRowId(kind, index),
        kind,
        name: '',
        description: '',
        pathPattern: '.*',
        execute: '',
        prompt: '',
        content: '',
    };
}

function newSkillForm(index: number): SkillItemForm {
    return {
        id: generateRowId('skill', index),
        name: '',
        description: '',
        pathPattern: '.*',
        skillMd: '',
        run: '',
    };
}

export function getEmptyFormState(): McpSkillsFormState {
    return {
        repositoryName: '',
        repositoryDescription: '',
        siteDomain: '',
        tools: [],
        prompts: [],
        resources: [],
        skills: [],
    };
}

function parseMcpToForm(item: SnapshotMcpItem, index: number): McpItemForm | null {
    const kind = (item.itemType || '').toLowerCase();
    if (kind !== 'tool' && kind !== 'prompt' && kind !== 'resource') return null;
    const manifest = (item.manifest && typeof item.manifest === 'object') ? item.manifest as Record<string, unknown> : {};
    return {
        id: generateRowId(kind, index),
        kind,
        name: item.name || '',
        description: item.description || '',
        pathPattern: item.pathPattern || '.*',
        execute: typeof manifest.execute === 'string' ? manifest.execute : '',
        prompt: typeof manifest.prompt === 'string' ? manifest.prompt : '',
        content: typeof manifest.content === 'string' ? manifest.content : (typeof manifest.text === 'string' ? manifest.text : ''),
    };
}

export function parseRepositoryToFormState(repo: McpSkillsRepository): McpSkillsFormState {
    const storedTools = repo.mcp?.tools || [];
    const storedPrompts = repo.mcp?.prompts || [];
    const storedResources = repo.mcp?.resources || [];
    const mcp = repo.installSnapshot?.snapshot?.mcp || [];
    const skills = repo.installSnapshot?.snapshot?.skills || [];

    const parsedStoredTools = storedTools.map((item: StoredMcpTool, index) => ({
        id: generateRowId('tool', index),
        kind: 'tool' as const,
        name: item.name || '',
        description: item.description || '',
        pathPattern: '.*',
        execute: '',
        prompt: '',
        content: '',
    }));
    const parsedStoredPrompts = storedPrompts.map((item: StoredMcpPrompt, index) => ({
        id: generateRowId('prompt', index),
        kind: 'prompt' as const,
        name: item.name || '',
        description: item.description || '',
        pathPattern: '.*',
        execute: '',
        prompt: '',
        content: '',
    }));
    const parsedStoredResources = storedResources.map((item: StoredMcpResource, index) => ({
        id: generateRowId('resource', index),
        kind: 'resource' as const,
        name: item.name || '',
        description: item.description || '',
        pathPattern: '.*',
        execute: '',
        prompt: '',
        content: '',
    }));

    const parsedLegacyMcp = mcp
        .map((item, index) => parseMcpToForm(item, index))
        .filter(Boolean) as McpItemForm[];

    const tools = parsedStoredTools.length > 0 ? parsedStoredTools : parsedLegacyMcp.filter((x) => x.kind === 'tool');
    const prompts = parsedStoredPrompts.length > 0 ? parsedStoredPrompts : parsedLegacyMcp.filter((x) => x.kind === 'prompt');
    const resources = parsedStoredResources.length > 0 ? parsedStoredResources : parsedLegacyMcp.filter((x) => x.kind === 'resource');

    const parsedSkills = skills.map((item, index) => ({
        id: generateRowId('skill', index),
        name: item.name || '',
        description: item.description || '',
        pathPattern: item.pathPattern || '.*',
        skillMd: item.skillMd || '',
        run: item.run || '',
    }));

    return {
        repositoryName: repo.repositoryName || '',
        repositoryDescription: repo.installSnapshot?.repository?.description || '',
        siteDomain: repo.siteDomain || '',
        tools,
        prompts,
        resources,
        skills: parsedSkills,
    };
}

function toMcpSnapshot(items: McpItemForm[]): SnapshotMcpItem[] {
    return items
        .filter((item) => item.name.trim())
        .map((item) => {
            const manifest: Record<string, unknown> = {};
            if (item.kind === 'tool' && item.execute.trim()) manifest.execute = item.execute;
            if (item.kind === 'prompt') {
                if (item.prompt.trim()) manifest.prompt = item.prompt;
                if (item.execute.trim()) manifest.execute = item.execute;
            }
            if (item.kind === 'resource') {
                if (item.content.trim()) manifest.content = item.content;
                if (item.execute.trim()) manifest.execute = item.execute;
            }
            return {
                name: item.name.trim(),
                description: item.description.trim() || null,
                itemType: item.kind,
                manifest,
                pathPattern: normalizePathPattern(item.pathPattern),
            };
        });
}

function toSkillSnapshot(items: SkillItemForm[]): SnapshotSkillItem[] {
    return items
        .filter((item) => item.name.trim())
        .map((item) => ({
            name: item.name.trim(),
            description: item.description.trim() || null,
            version: 'local',
            skillMd: item.skillMd,
            run: item.run.trim() ? item.run : null,
            pathPattern: normalizePathPattern(item.pathPattern),
        }));
}

function toStoredTools(items: McpItemForm[]): StoredMcpTool[] {
    return items
        .filter((item) => item.name.trim())
        .map((item) => ({
            name: item.name.trim(),
            description: item.description.trim() || undefined,
        }));
}

function toStoredPrompts(items: McpItemForm[]): StoredMcpPrompt[] {
    return items
        .filter((item) => item.name.trim())
        .map((item) => ({
            name: item.name.trim(),
            description: item.description.trim() || undefined,
        }));
}

function toStoredResources(items: McpItemForm[]): StoredMcpResource[] {
    return items
        .filter((item) => item.name.trim())
        .map((item) => ({
            uri: `page://local/${encodeURIComponent(item.name.trim())}`,
            name: item.name.trim(),
            description: item.description.trim() || undefined,
        }));
}

export function buildRepositoryPayloadFromForm(
    form: McpSkillsFormState,
    existing: McpSkillsRepository | null,
    now: number,
    createUuid: () => string
): McpSkillsRepository {
    const repositoryId = existing?.repositoryId || createUuid();
    const id = existing?.id || `repo_${repositoryId}|${normalizeDomain(form.siteDomain)}|local://mcp-skills`;
    const createdAtIso = existing?.installSnapshot?.release?.createdAt || new Date(now).toISOString();

    const mcpItems = toMcpSnapshot([
        ...form.tools.map((x) => ({ ...x, kind: 'tool' as const })),
        ...form.prompts.map((x) => ({ ...x, kind: 'prompt' as const })),
        ...form.resources.map((x) => ({ ...x, kind: 'resource' as const })),
    ]);
    const skillItems = toSkillSnapshot(form.skills);

    return {
        id,
        repositoryId,
        repositoryName: form.repositoryName.trim(),
        siteDomain: normalizeDomain(form.siteDomain),
        release: 'local',
        apiBase: '',
        marketOrigin: 'local://mcp-skills',
        marketDetailUrl: '',
        mcp: {
            tools: toStoredTools(form.tools),
            prompts: toStoredPrompts(form.prompts),
            resources: toStoredResources(form.resources),
        },
        installSnapshot: {
            repository: {
                id: repositoryId,
                name: form.repositoryName.trim(),
                description: form.repositoryDescription.trim() || null,
                siteDomain: normalizeDomain(form.siteDomain),
                author: { id: 'local', name: 'Local Author' },
                starsCount: 0,
                usageCount: 0,
                lastActiveAt: null,
                latestReleaseVersion: 'local',
            },
            release: {
                id: `local-${repositoryId}`,
                repositoryId,
                version: 'local',
                name: null,
                changelog: null,
                isLatest: true,
                createdAt: createdAtIso,
            },
            snapshot: {
                mcp: mcpItems,
                skills: skillItems,
            },
            integrity: { algorithm: 'manual', digest: 'manual' },
        },
        integrity: { algorithm: 'manual', digest: 'manual' },
        enabled: existing?.enabled ?? true,
        installedAt: existing?.installedAt ?? now,
        updatedAt: now,
    };
}

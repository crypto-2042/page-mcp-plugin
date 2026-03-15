import type { McpSkillsRepository, SnapshotSkillItem, StoredMcpPrompt, StoredMcpResource, StoredMcpTool } from '../shared/types.js';

export type McpKind = 'tool' | 'prompt' | 'resource';

export type ToolForm = {
    id: string;
    name: string;
    description: string;
    path: string;
    execute: string;
};

export type PromptForm = {
    id: string;
    name: string;
    description: string;
    path: string;
    prompt: string;
};

export type ResourceForm = {
    id: string;
    name: string;
    description: string;
    path: string;
    uri: string;
    mimeType: string;
};

export type SkillItemForm = {
    id: string;
    name: string;
    description: string;
    path: string;
    skillMd: string;
    run: string;
};

export type McpSkillsFormState = {
    repositoryName: string;
    repositoryDescription: string;
    siteDomain: string;
    tools: ToolForm[];
    prompts: PromptForm[];
    resources: ResourceForm[];
    skills: SkillItemForm[];
};

function generateRowId(prefix: string, index: number): string {
    return `${prefix}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePath(path: string): string {
    return path.trim() || '.*';
}

function normalizeDomain(input: string): string {
    return input.trim().toLowerCase();
}

function newSkillForm(index: number): SkillItemForm {
    return {
        id: generateRowId('skill', index),
        name: '',
        description: '',
        path: '.*',
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

export function parseRepositoryToFormState(repo: McpSkillsRepository): McpSkillsFormState {
    // Use mcp buckets directly (StoredMcpSnapshot format)
    const storedTools = repo.mcp?.tools || [];
    const storedPrompts = repo.mcp?.prompts || [];
    const storedResources = repo.mcp?.resources || [];
    const skills = repo.installSnapshot?.snapshot?.skills || [];

    const tools = storedTools.map((item: StoredMcpTool, index) => ({
        id: generateRowId('tool', index),
        name: item.name || '',
        description: item.description || '',
        path: (item as any).path || '.*',
        execute: (item as any).execute || '',
    }));

    const prompts = storedPrompts.map((item: StoredMcpPrompt, index) => ({
        id: generateRowId('prompt', index),
        name: item.name || '',
        description: item.description || '',
        path: (item as any).path || '.*',
        prompt: Array.isArray(item.messages) && item.messages[0]
            ? String((item.messages[0] as any)?.content?.text || '')
            : '',
    }));

    const resources = storedResources.map((item: StoredMcpResource, index) => ({
        id: generateRowId('resource', index),
        name: item.name || '',
        description: item.description || '',
        path: (item as any).path || '.*',
        uri: item.uri || `page://selector/`,
        mimeType: item.mimeType || 'application/text',
    }));

    const parsedSkills = skills.map((item, index) => ({
        id: generateRowId('skill', index),
        name: item.name || '',
        description: item.description || '',
        path: item.path || '.*',
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

function toStoredTools(items: ToolForm[]): StoredMcpTool[] {
    return items
        .filter((item) => item.name.trim())
        .map((item) => ({
            name: item.name.trim(),
            description: item.description.trim() || undefined,
            ...(item.execute.trim() ? { execute: item.execute.trim() } as any : {}),
            path: normalizePath(item.path),
        }));
}

function toStoredPrompts(items: PromptForm[]): StoredMcpPrompt[] {
    return items
        .filter((item) => item.name.trim())
        .map((item) => {
            const messages: Array<Record<string, unknown>> = item.prompt.trim()
                ? [{ role: 'user', content: { type: 'text', text: item.prompt.trim() } }]
                : [];
            return {
                name: item.name.trim(),
                description: item.description.trim() || undefined,
                messages: messages.length > 0 ? messages : undefined,
                path: normalizePath(item.path),
            };
        });
}

function toStoredResources(items: ResourceForm[]): StoredMcpResource[] {
    return items
        .filter((item) => item.name.trim())
        .map((item) => ({
            uri: item.uri.trim() || `page://local/${encodeURIComponent(item.name.trim())}`,
            name: item.name.trim(),
            description: item.description.trim() || undefined,
            mimeType: item.mimeType.trim() || undefined,
            path: normalizePath(item.path),
        }));
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
            path: normalizePath(item.path),
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

    const storedTools = toStoredTools(form.tools);
    const storedPrompts = toStoredPrompts(form.prompts);
    const storedResources = toStoredResources(form.resources);
    const skillItems = toSkillSnapshot(form.skills);

    // mcp is StoredMcpSnapshot — same format as native, no intermediate conversion
    const mcp = {
        tools: storedTools,
        prompts: storedPrompts,
        resources: storedResources,
    };

    return {
        id,
        repositoryId,
        repositoryName: form.repositoryName.trim(),
        siteDomain: normalizeDomain(form.siteDomain),
        release: 'local',
        apiBase: '',
        marketOrigin: 'local://mcp-skills',
        marketDetailUrl: '',
        mcp,
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
                mcp,
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

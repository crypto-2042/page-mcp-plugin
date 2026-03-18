import type { McpSkillsRepository, SnapshotSkillItem, StoredMcpPrompt, StoredMcpPromptArgument, StoredMcpResource, StoredMcpTool } from '../shared/types.js';

export type McpKind = 'tool' | 'prompt' | 'resource';

export type ToolInputType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

export type ToolInputFieldForm = {
    id: string;
    name: string;
    description: string;
    type: ToolInputType;
    required: boolean;
};

export type PromptArgumentForm = {
    id: string;
    name: string;
    description: string;
    required: boolean;
};

export type ToolForm = {
    id: string;
    name: string;
    description: string;
    path: string;
    execute: string;
    inputSchemaFields: ToolInputFieldForm[];
};

export type PromptForm = {
    id: string;
    name: string;
    description: string;
    path: string;
    prompt: string;
    arguments: PromptArgumentForm[];
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

function parseToolInputSchemaFields(inputSchema: Record<string, unknown> | undefined, index: number): ToolInputFieldForm[] {
    if (!inputSchema || typeof inputSchema !== 'object') return [];

    const requiredSet = new Set(
        Array.isArray((inputSchema as any).required)
            ? (inputSchema as any).required.filter((item: unknown): item is string => typeof item === 'string')
            : []
    );

    const properties = (inputSchema as any).properties;
    if (!properties || typeof properties !== 'object') return [];

    return Object.entries(properties)
        .filter(([, value]) => value && typeof value === 'object')
        .map(([name, value], fieldIndex) => {
            const rawType = String((value as any).type || 'string');
            const type: ToolInputType =
                rawType === 'number' || rawType === 'integer' || rawType === 'boolean' || rawType === 'array' || rawType === 'object'
                    ? rawType
                    : 'string';
            return {
                id: generateRowId(`tool_input_${index}`, fieldIndex),
                name,
                description: String((value as any).description || ''),
                type,
                required: requiredSet.has(name),
            };
        });
}

function parsePromptArguments(argumentsList: StoredMcpPromptArgument[] | undefined, index: number): PromptArgumentForm[] {
    if (!Array.isArray(argumentsList)) return [];
    return argumentsList.map((item, argIndex) => ({
        id: generateRowId(`prompt_arg_${index}`, argIndex),
        name: item.name || '',
        description: item.description || '',
        required: Boolean(item.required),
    }));
}

function buildToolInputSchema(fields: ToolInputFieldForm[]): Record<string, unknown> | undefined {
    const normalized = fields.filter((item) => item.name.trim());
    if (normalized.length === 0) return undefined;

    const properties: Record<string, unknown> = {};
    const required = normalized.filter((item) => item.required).map((item) => item.name.trim());

    for (const item of normalized) {
        properties[item.name.trim()] = {
            type: item.type,
            ...(item.description.trim() ? { description: item.description.trim() } : {}),
        };
    }

    return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
    };
}

function buildPromptArguments(items: PromptArgumentForm[]): StoredMcpPromptArgument[] | undefined {
    const normalized = items.filter((item) => item.name.trim());
    if (normalized.length === 0) return undefined;
    return normalized.map((item) => ({
        name: item.name.trim(),
        ...(item.description.trim() ? { description: item.description.trim() } : {}),
        ...(item.required ? { required: true } : {}),
    }));
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
        inputSchemaFields: parseToolInputSchemaFields(item.inputSchema, index),
    }));

    const prompts = storedPrompts.map((item: StoredMcpPrompt, index) => ({
        id: generateRowId('prompt', index),
        name: item.name || '',
        description: item.description || '',
        path: (item as any).path || '.*',
        prompt: Array.isArray(item.messages) && item.messages[0]
            ? String((item.messages[0] as any)?.content?.text || '')
            : '',
        arguments: parsePromptArguments(item.arguments, index),
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
        .map((item) => {
            const inputSchema = buildToolInputSchema(item.inputSchemaFields);
            return {
                name: item.name.trim(),
                description: item.description.trim() || undefined,
                ...(item.execute.trim() ? { execute: item.execute.trim() } as any : {}),
                path: normalizePath(item.path),
                ...(inputSchema ? { inputSchema } : {}),
            };
        });
}

function toStoredPrompts(items: PromptForm[]): StoredMcpPrompt[] {
    return items
        .filter((item) => item.name.trim())
        .map((item) => {
            const messages: Array<Record<string, unknown>> = item.prompt.trim()
                ? [{ role: 'user', content: { type: 'text', text: item.prompt.trim() } }]
                : [];
            const args = buildPromptArguments(item.arguments);
            return {
                name: item.name.trim(),
                description: item.description.trim() || undefined,
                messages: messages.length > 0 ? messages : undefined,
                path: normalizePath(item.path),
                ...(args ? { arguments: args } : {}),
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

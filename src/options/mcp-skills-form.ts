import type { McpSkillsRepository, SnapshotSkillItem, StoredMcpPrompt, StoredMcpPromptArgument, StoredMcpResource, StoredMcpTool } from '../shared/types.js';

export type McpKind = 'tool' | 'prompt' | 'resource';

export type ToolInputType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

export type ToolInputFieldForm = {
    id: string;
    name: string;
    description: string;
    type: ToolInputType;
    required: boolean;
    enumValues: string[];
    properties: ToolInputFieldForm[];
    items: ToolInputFieldForm | null;
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

export function parseEnumValuesText(value: string): string[] {
    return value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
}

export function buildSchemaNodeSummary(field: ToolInputFieldForm): string {
    if (field.type === 'object') {
        return `object · ${field.properties.length} propert${field.properties.length === 1 ? 'y' : 'ies'}`;
    }
    if (field.type === 'array') {
        return `array · item: ${field.items?.type || 'unset'}`;
    }
    if (field.enumValues.length > 0) {
        return `${field.type} · enum(${field.enumValues.length})`;
    }
    return field.type;
}

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
        .map(([name, value], fieldIndex) => parseToolSchemaNode(name, value, requiredSet.has(name), `tool_input_${index}`, fieldIndex));
}

function normalizeToolInputType(rawType: unknown): ToolInputType {
    const value = String(rawType || 'string');
    return value === 'number' || value === 'integer' || value === 'boolean' || value === 'array' || value === 'object'
        ? value
        : 'string';
}

function parseEnumValues(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item));
}

function parseToolSchemaNode(
    name: string,
    value: unknown,
    required: boolean,
    prefix: string,
    index: number
): ToolInputFieldForm {
    const record = (value && typeof value === 'object') ? (value as Record<string, unknown>) : {};
    const type = normalizeToolInputType(record.type);
    const requiredSet = new Set(
        Array.isArray(record.required)
            ? record.required.filter((item): item is string => typeof item === 'string')
            : []
    );
    const childProperties = (record.properties && typeof record.properties === 'object')
        ? Object.entries(record.properties as Record<string, unknown>)
            .filter(([, child]) => child && typeof child === 'object')
            .map(([childName, childValue], childIndex) => parseToolSchemaNode(
                childName,
                childValue,
                requiredSet.has(childName),
                `${prefix}_${index}_prop`,
                childIndex
            ))
        : [];
    const childItems = record.items && typeof record.items === 'object'
        ? parseToolSchemaNode('', record.items, false, `${prefix}_${index}_item`, 0)
        : null;

    return {
        id: generateRowId(prefix, index),
        name,
        description: String(record.description || ''),
        type,
        required,
        enumValues: parseEnumValues(record.enum),
        properties: childProperties,
        items: childItems,
    };
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
        properties[item.name.trim()] = buildToolSchemaNode(item);
    }

    return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
    };
}

function parseEnumLiteral(raw: string, type: ToolInputType): unknown {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (type === 'number' || type === 'integer') {
        const value = Number(trimmed);
        return Number.isFinite(value) ? value : trimmed;
    }
    if (type === 'boolean') {
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        return trimmed;
    }
}

function buildToolSchemaNode(field: ToolInputFieldForm): Record<string, unknown> {
    const schema: Record<string, unknown> = {
        type: field.type,
        ...(field.description.trim() ? { description: field.description.trim() } : {}),
    };

    const enumValues = field.enumValues
        .map((item) => parseEnumLiteral(item, field.type))
        .filter((item) => item !== undefined);
    if (enumValues.length > 0) {
        schema.enum = enumValues;
    }

    if (field.type === 'object') {
        const childProperties = field.properties.filter((item) => item.name.trim());
        schema.properties = Object.fromEntries(childProperties.map((item) => [item.name.trim(), buildToolSchemaNode(item)]));
        const required = childProperties.filter((item) => item.required).map((item) => item.name.trim());
        if (required.length > 0) {
            schema.required = required;
        }
    }

    if (field.type === 'array' && field.items) {
        schema.items = buildToolSchemaNode(field.items);
    }

    return schema;
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

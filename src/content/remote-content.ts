import type { InstalledRemoteRepository } from '../shared/types.js';
import { matchesDomainPattern } from '../shared/domain-match.js';

export interface SourceTagged {
    sourceType: 'native' | 'remote';
    sourceLabel: string;
    sourceRepositoryId?: string;
}

export interface RemoteMcpItem {
    name: string;
    description?: string | null;
    itemType?: string;
    manifest?: Record<string, unknown>;
    prompt?: string;
    /** JS function string for page-level execution */
    execute?: string;
}

export interface RemoteSkillItem {
    name: string;
    description?: string | null;
    version?: string;
    skillMd?: string;
    run?: string | null;
}

export interface RemoteRepositoryContent {
    tools: RemoteMcpItem[];
    prompts: RemoteMcpItem[];
    resources: RemoteMcpItem[];
    skills: RemoteSkillItem[];
}

export interface McpBucketContent<TTool = RemoteMcpItem, TPrompt = RemoteMcpItem, TResource = RemoteMcpItem> {
    tools: TTool[];
    prompts: TPrompt[];
    resources: TResource[];
}

const regexCache = new Map<string, RegExp | null>();

/** @deprecated Use matchesDomainPattern from shared/domain-match.ts */
export const matchesDomain = matchesDomainPattern;

export function marketLabelFromOrigin(origin: string): string {
    try {
        return new URL(origin).host.toLowerCase();
    } catch {
        return origin.toLowerCase();
    }
}

export function shouldLoadRemoteRepositories(settings: { remoteLoadingEnabled: boolean }): boolean {
    void settings;
    return false;
}

function withSource<T extends { name?: string }>(
    item: T,
    sourceType: 'native' | 'remote',
    sourceLabel: string,
    sourceRepositoryId?: string
): T & SourceTagged {
    return {
        ...item,
        sourceType,
        sourceLabel,
        sourceRepositoryId,
    };
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of items) {
        const key = keyFn(item);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

function ensureTagged(item: any): any {
    if (item.sourceType === 'native' || item.sourceType === 'remote') return item;
    return withSource(item, 'native', 'native');
}

export function mergeWithSourceLabels(
    nativeData: { tools: any[]; prompts: any[]; resources: any[]; skills: any[] },
    remoteData: RemoteRepositoryContent
): {
    tools: Array<any & SourceTagged>;
    prompts: Array<any & SourceTagged>;
    resources: Array<any & SourceTagged>;
    skills: Array<any & SourceTagged>;
} {
    const nativeTools = nativeData.tools.map(ensureTagged);
    const nativePrompts = nativeData.prompts.map(ensureTagged);
    const nativeResources = nativeData.resources.map(ensureTagged);
    const nativeSkills = nativeData.skills.map(ensureTagged);

    const remoteTools = remoteData.tools.map(ensureTagged);
    const remotePrompts = remoteData.prompts.map(ensureTagged);
    const remoteResources = remoteData.resources.map(ensureTagged);
    const remoteSkills = remoteData.skills.map(ensureTagged);

    return {
        tools: dedupeByKey([...nativeTools, ...remoteTools], (item) => {
            const type = String((item as any).itemType || 'tool');
            return `${String((item as any).name || '')}|${type}|${item.sourceType}|${item.sourceRepositoryId || ''}`;
        }),
        prompts: dedupeByKey([...nativePrompts, ...remotePrompts], (item) => {
            return `${String((item as any).name || '')}|${item.sourceType}|${item.sourceRepositoryId || ''}`;
        }),
        resources: dedupeByKey([...nativeResources, ...remoteResources], (item) => {
            return `${String((item as any).name || '')}|${item.sourceType}|${item.sourceRepositoryId || ''}`;
        }),
        skills: dedupeByKey([...nativeSkills, ...remoteSkills], (item) => {
            const version = String((item as any).version || '');
            return `${String((item as any).name || '')}|${version}|${item.sourceType}|${item.sourceRepositoryId || ''}`;
        }),
    };
}

export function mergeMcpBuckets<TTool, TPrompt, TResource>(
    left: McpBucketContent<TTool, TPrompt, TResource>,
    right: McpBucketContent<TTool, TPrompt, TResource>
): McpBucketContent<TTool, TPrompt, TResource> {
    return {
        tools: [...left.tools, ...right.tools],
        prompts: [...left.prompts, ...right.prompts],
        resources: [...left.resources, ...right.resources],
    };
}

function matchesPath(pathname: string, path?: string): boolean {
    if (!path) return true;
    let compiled = regexCache.get(path);
    if (compiled === undefined) {
        try {
            compiled = new RegExp(path);
        } catch {
            compiled = null;
        }
        regexCache.set(path, compiled);
    }
    if (!compiled) return false;
    return compiled.test(pathname);
}

export function getLocalRepositoryContent(
    repo: InstalledRemoteRepository,
    pathname: string
): RemoteRepositoryContent {
    const snapshot = repo.installSnapshot?.snapshot;
    if (!snapshot) return { tools: [], prompts: [], resources: [], skills: [] };
    const mcp = snapshot.mcp;
    const skillItems = snapshot.skills ?? [];

    // snapshot.mcp is StoredMcpSnapshot: { tools, prompts, resources }
    const tools = Array.isArray(mcp?.tools) ? mcp.tools : [];
    const prompts = Array.isArray(mcp?.prompts) ? mcp.prompts : [];
    const resources = Array.isArray(mcp?.resources) ? mcp.resources : [];

    return {
        tools: tools
            .filter((item) => matchesPath(pathname, (item as any).path))
            .map((item) => ({
                name: item.name,
                description: item.description,
                inputSchema: item.inputSchema,
                annotations: item.annotations,
                execute: item.execute,
            })),
        prompts: prompts
            .filter((item) => matchesPath(pathname, (item as any).path))
            .map((item) => ({
                name: item.name,
                description: item.description,
                arguments: item.arguments,
                messages: item.messages,
            })),
        resources: resources
            .filter((item) => matchesPath(pathname, (item as any).path))
            .map((item) => ({
                name: item.name,
                description: item.description,
                uri: item.uri,
                mimeType: item.mimeType,
            })),
        skills: skillItems
            .filter((item) => matchesPath(pathname, item.path))
            .map((item) => ({
                name: item.name,
                description: item.description,
                version: item.version,
                skillMd: item.skillMd,
                run: item.run,
            })),
    };
}

export function collectRemoteRepositoryContent(
    repositories: InstalledRemoteRepository[],
    hostname: string,
    pathname: string
): RemoteRepositoryContent {
    let aggregate: RemoteRepositoryContent = {
        tools: [],
        prompts: [],
        resources: [],
        skills: [],
    };

    for (const repo of repositories) {
        if (!repo.enabled || !matchesDomain(hostname, repo.siteDomain)) continue;
        const local = getLocalRepositoryContent(repo, pathname);
        const tagged = tagRemoteContent(local, repo.repositoryId, marketLabelFromOrigin(repo.marketOrigin));
        aggregate = {
            ...mergeMcpBuckets(aggregate, tagged),
            skills: [...aggregate.skills, ...tagged.skills],
        };
    }

    return aggregate;
}

export function tagRemoteContent(
    content: RemoteRepositoryContent,
    repositoryId: string,
    marketLabel: string
): RemoteRepositoryContent {
    return {
        tools: content.tools.map((item) => withSource(item, 'remote', `remote:${marketLabel}`, repositoryId)),
        prompts: content.prompts.map((item) => withSource(item, 'remote', `remote:${marketLabel}`, repositoryId)),
        resources: content.resources.map((item) => withSource(item, 'remote', `remote:${marketLabel}`, repositoryId)),
        skills: content.skills.map((item) => withSource(item, 'remote', `remote:${marketLabel}`, repositoryId)),
    };
}

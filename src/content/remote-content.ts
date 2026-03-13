import type { InstalledRemoteRepository } from '../shared/types.js';

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

export function matchesDomain(hostname: string, siteDomain: string): boolean {
    const host = hostname.toLowerCase();
    const domain = siteDomain.toLowerCase();
    if (domain.startsWith('*.')) {
        const base = domain.slice(2);
        return host === base || host.endsWith(`.${base}`);
    }
    return host === domain;
}

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

function matchesPathPattern(pathname: string, pathPattern?: string): boolean {
    if (!pathPattern) return true;
    let compiled = regexCache.get(pathPattern);
    if (compiled === undefined) {
        try {
            compiled = new RegExp(pathPattern);
        } catch {
            compiled = null;
        }
        regexCache.set(pathPattern, compiled);
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
    const mcpItems = snapshot.mcp ?? [];
    const skillItems = snapshot.skills ?? [];

    const filtered = mcpItems.filter((item) => matchesPathPattern(pathname, item.pathPattern));

    return {
        tools: filtered
            .filter((item) => item.itemType === 'tool')
            .map((item) => ({
                name: item.name,
                description: item.description,
                itemType: item.itemType,
                manifest: item.manifest,
            })),
        prompts: filtered
            .filter((item) => item.itemType === 'prompt')
            .map((item) => ({
                name: item.name,
                description: item.description,
                itemType: item.itemType,
                manifest: item.manifest,
                prompt: typeof item.manifest?.prompt === 'string' ? item.manifest.prompt : undefined,
            })),
        resources: filtered
            .filter((item) => item.itemType === 'resource')
            .map((item) => ({
                name: item.name,
                description: item.description,
                itemType: item.itemType,
                manifest: item.manifest,
            })),
        skills: skillItems
            .filter((item) => matchesPathPattern(pathname, item.pathPattern))
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

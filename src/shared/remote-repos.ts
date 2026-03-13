import type {
    InstalledRemoteRepository,
    RemoteInstallRequest,
    SnapshotMcpItem,
    StoredMcpPrompt,
    StoredMcpResource,
    StoredMcpSnapshot,
    StoredMcpTool,
} from './types.js';

function defaultMcpSnapshot(): StoredMcpSnapshot {
    return { tools: [], prompts: [], resources: [] };
}

function toStoredTool(item: SnapshotMcpItem): StoredMcpTool {
    const manifest = (item.manifest && typeof item.manifest === 'object')
        ? item.manifest as Record<string, unknown>
        : {};
    return {
        name: item.name,
        description: item.description ?? undefined,
        inputSchema: (manifest.inputSchema as Record<string, unknown> | undefined),
        annotations: (manifest.annotations as Record<string, unknown> | undefined),
        title: typeof manifest.title === 'string' ? manifest.title : undefined,
    };
}

function toStoredPrompt(item: SnapshotMcpItem): StoredMcpPrompt {
    const manifest = (item.manifest && typeof item.manifest === 'object')
        ? item.manifest as Record<string, unknown>
        : {};
    return {
        name: item.name,
        description: item.description ?? undefined,
        title: typeof manifest.title === 'string' ? manifest.title : undefined,
        arguments: Array.isArray(manifest.arguments)
            ? manifest.arguments as StoredMcpPrompt['arguments']
            : undefined,
        messages: Array.isArray(manifest.messages)
            ? manifest.messages as StoredMcpPrompt['messages']
            : undefined,
    };
}

function toStoredResource(item: SnapshotMcpItem): StoredMcpResource {
    const manifest = (item.manifest && typeof item.manifest === 'object')
        ? item.manifest as Record<string, unknown>
        : {};
    return {
        uri: typeof manifest.uri === 'string' ? manifest.uri : `page://legacy/${encodeURIComponent(item.name)}`,
        name: item.name,
        description: item.description ?? undefined,
        mimeType: typeof manifest.mimeType === 'string' ? manifest.mimeType : undefined,
    };
}

export function toStoredMcpSnapshot(items: SnapshotMcpItem[]): StoredMcpSnapshot {
    const next = defaultMcpSnapshot();
    for (const item of items) {
        const kind = item.itemType?.toLowerCase();
        if (kind === 'tool') next.tools.push(toStoredTool(item));
        if (kind === 'prompt') next.prompts.push(toStoredPrompt(item));
        if (kind === 'resource') next.resources.push(toStoredResource(item));
    }
    return next;
}

export function normalizeInstalledRepo(repo: InstalledRemoteRepository): InstalledRemoteRepository {
    const snapshotItems = repo.installSnapshot?.snapshot?.mcp ?? [];
    return {
        ...repo,
        siteDomain: normalizeDomain(repo.siteDomain),
        marketOrigin: normalizeOrigin(repo.marketOrigin),
        apiBase: normalizeApiBase(repo.apiBase),
        mcp: repo.mcp ?? toStoredMcpSnapshot(snapshotItems),
    };
}

function safeParseUrl(input: string): URL | null {
    try {
        return new URL(input);
    } catch {
        return null;
    }
}

export function normalizeDomain(domain: string): string {
    return domain.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
}

export function normalizeOrigin(origin: string): string {
    const url = safeParseUrl(origin);
    if (!url) return origin.trim().toLowerCase().replace(/\/$/, '');
    return `${url.protocol}//${url.host}`.toLowerCase();
}

export function normalizeApiBase(apiBase: string): string {
    const raw = apiBase.trim();
    if (!raw) return raw;
    return raw.replace(/\/+$/, '');
}

export function buildRepoKey(repositoryId: string, siteDomain: string, marketOrigin: string): string {
    return [repositoryId.trim(), normalizeDomain(siteDomain), normalizeOrigin(marketOrigin)].join('|');
}

function makeRepoId(repositoryId: string, siteDomain: string, marketOrigin: string): string {
    return `repo_${buildRepoKey(repositoryId, siteDomain, marketOrigin)}`;
}

export function upsertInstalledRepo(
    current: InstalledRemoteRepository[],
    payload: RemoteInstallRequest,
    now = Date.now()
): InstalledRemoteRepository[] {
    const next = [...current];
    const siteDomain = normalizeDomain(payload.siteDomain);
    const marketOrigin = normalizeOrigin(payload.marketOrigin);
    const apiBase = normalizeApiBase(payload.apiBase);
    const key = buildRepoKey(payload.repositoryId, siteDomain, marketOrigin);

    const idx = next.findIndex((item) => buildRepoKey(item.repositoryId, item.siteDomain, item.marketOrigin) === key);
    if (idx === -1) {
        next.unshift(normalizeInstalledRepo({
            id: makeRepoId(payload.repositoryId, siteDomain, marketOrigin),
            repositoryId: payload.repositoryId.trim(),
            repositoryName: payload.repositoryName.trim(),
            siteDomain,
            release: payload.release.trim(),
            apiBase,
            marketOrigin,
            marketDetailUrl: payload.marketDetailUrl.trim(),
            mcp: payload.mcp ?? defaultMcpSnapshot(),
            installSnapshot: payload.installSnapshot,
            integrity: payload.integrity,
            enabled: true,
            installedAt: now,
            updatedAt: now,
        }));
        return next;
    }

    const existing = next[idx]!;
    next[idx] = normalizeInstalledRepo({
        ...existing,
        repositoryName: payload.repositoryName.trim() || existing.repositoryName,
        release: payload.release.trim(),
        apiBase: apiBase || existing.apiBase,
        marketDetailUrl: payload.marketDetailUrl.trim() || existing.marketDetailUrl,
        mcp: payload.mcp ?? existing.mcp ?? defaultMcpSnapshot(),
        installSnapshot: payload.installSnapshot,
        integrity: payload.integrity,
        updatedAt: now,
    });
    return next;
}

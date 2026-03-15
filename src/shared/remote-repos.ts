import type {
    InstalledRemoteRepository,
    RemoteInstallRequest,
    StoredMcpSnapshot,
} from './types.js';

function defaultMcpSnapshot(): StoredMcpSnapshot {
    return { tools: [], prompts: [], resources: [] };
}

export function normalizeInstalledRepo(repo: InstalledRemoteRepository): InstalledRemoteRepository {
    // snapshot.mcp is StoredMcpSnapshot — use it directly as fallback for repo.mcp
    const snapshotMcp = repo.installSnapshot?.snapshot?.mcp;
    return {
        ...repo,
        siteDomain: normalizeDomain(repo.siteDomain),
        marketOrigin: normalizeOrigin(repo.marketOrigin),
        apiBase: normalizeApiBase(repo.apiBase),
        mcp: repo.mcp ?? snapshotMcp ?? defaultMcpSnapshot(),
        allowWithoutConfirm: repo.allowWithoutConfirm ?? false,
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

import type { McpSkillsRepository } from '../shared/types.js';
import { buildRepoKey, normalizeDomain, normalizeInstalledRepo, normalizeOrigin } from '../shared/remote-repos.js';

function makeRepoId(repo: McpSkillsRepository): string {
    return `repo_${buildRepoKey(repo.repositoryId, repo.siteDomain, repo.marketOrigin)}`;
}

export function upsertMcpSkillsRepo(
    list: McpSkillsRepository[],
    repo: McpSkillsRepository,
    now = Date.now()
): McpSkillsRepository[] {
    const next = [...list];
    const normalized = normalizeInstalledRepo({
        ...repo,
        repositoryId: repo.repositoryId.trim(),
        repositoryName: repo.repositoryName.trim(),
        siteDomain: normalizeDomain(repo.siteDomain),
        marketOrigin: normalizeOrigin(repo.marketOrigin),
        marketDetailUrl: repo.marketDetailUrl.trim(),
        release: repo.release.trim(),
        apiBase: repo.apiBase.trim().replace(/\/+$/, ''),
    });

    const targetId = normalized.id?.trim() || makeRepoId(normalized);
    const idx = next.findIndex((item) => item.id === targetId);
    if (idx === -1) {
        next.unshift({
            ...normalized,
            id: targetId,
            installedAt: now,
            updatedAt: now,
            enabled: normalized.enabled ?? true,
        });
        return next;
    }

    next[idx] = {
        ...next[idx],
        ...normalized,
        id: targetId,
        installedAt: next[idx]!.installedAt,
        updatedAt: now,
    };
    return next;
}

export function toggleMcpSkillsRepoEnabled(
    list: McpSkillsRepository[],
    repoId: string,
    enabled: boolean,
    now = Date.now()
): McpSkillsRepository[] {
    return list.map((item) =>
        item.id === repoId
            ? { ...item, enabled, updatedAt: now }
            : item
    );
}

export function deleteMcpSkillsRepoById(
    list: McpSkillsRepository[],
    repoId: string
): McpSkillsRepository[] {
    return list.filter((item) => item.id !== repoId);
}

import type { InstalledRemoteRepository } from '../shared/types.js';

export function filterRemoteRepos(
    list: InstalledRemoteRepository[],
    query: string
): InstalledRemoteRepository[] {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) =>
        item.repositoryName.toLowerCase().includes(q) ||
        item.siteDomain.toLowerCase().includes(q)
    );
}

export function normalizeMarketOrigin(input: string): string {
    const raw = input.trim();
    if (!raw) return '';
    try {
        const url = new URL(raw);
        return `${url.protocol}//${url.host}`.toLowerCase();
    } catch {
        return raw.toLowerCase().replace(/\/+$/, '');
    }
}

export function addMarketOrigin(list: string[], originInput: string): string[] {
    const origin = normalizeMarketOrigin(originInput);
    if (!origin) return list;
    if (list.includes(origin)) return list;
    return [...list, origin];
}

export function removeMarketOrigin(list: string[], origin: string): string[] {
    return list.filter((item) => item !== origin);
}

export function setRepoAllowWithoutConfirm(
    list: InstalledRemoteRepository[],
    repoId: string,
    allowWithoutConfirm: boolean
): InstalledRemoteRepository[] {
    return list.map((item) =>
        item.id === repoId ? { ...item, allowWithoutConfirm } : item
    );
}

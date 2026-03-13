import type { InstalledRemoteRepository } from '../shared/types.js';

export function toggleRemoteRepoEnabled(
    list: InstalledRemoteRepository[],
    repoId: string,
    enabled: boolean,
    now = Date.now()
): InstalledRemoteRepository[] {
    return list.map((item) =>
        item.id === repoId
            ? { ...item, enabled, updatedAt: now }
            : item
    );
}

export function deleteRemoteRepoById(
    list: InstalledRemoteRepository[],
    repoId: string
): InstalledRemoteRepository[] {
    return list.filter((item) => item.id !== repoId);
}

export interface RemoteRepoDomainIndex {
    exact: Record<string, string[]>;
    wildcard: Record<string, string[]>;
}

function normalizeDomain(domain: string): string {
    return domain.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
}

export function buildDomainIndex(items: Array<{ id: string; siteDomain: string }>): RemoteRepoDomainIndex {
    const exact: Record<string, string[]> = {};
    const wildcard: Record<string, string[]> = {};

    for (const item of items) {
        const domain = normalizeDomain(item.siteDomain);
        if (!domain) continue;
        if (domain.startsWith('*.')) {
            const base = domain.slice(2);
            if (!wildcard[base]) wildcard[base] = [];
            wildcard[base].push(item.id);
        } else {
            if (!exact[domain]) exact[domain] = [];
            exact[domain].push(item.id);
        }
    }

    return { exact, wildcard };
}

export function lookupRepoIdsForHost(index: RemoteRepoDomainIndex, host: string): string[] {
    const normalizedHost = normalizeDomain(host);
    const out = new Set<string>();

    for (const id of index.exact[normalizedHost] ?? []) out.add(id);

    const parts = normalizedHost.split('.');
    for (let i = 0; i < parts.length; i++) {
        const suffix = parts.slice(i).join('.');
        for (const id of index.wildcard[suffix] ?? []) out.add(id);
    }

    return [...out];
}

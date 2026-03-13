type DocumentLike = {
    querySelector: (selector: string) => Element | null;
    createElement: (tagName: string) => Element;
    head?: { appendChild: (node: Element) => void };
};

type InstalledRepoLite = {
    repositoryId: string;
    siteDomain?: string;
    marketOrigin?: string;
    release: string;
    updatedAt?: number;
};

export function injectExtensionIdMeta(doc: DocumentLike, extensionId: string): boolean {
    const marker = doc.querySelector('meta[name="page-mcp-install-target"]');
    if (!marker || !extensionId) return false;

    let meta = doc.querySelector('meta[name="page-mcp-extension-id"]');
    if (!meta) {
        meta = doc.createElement('meta');
        meta.setAttribute('name', 'page-mcp-extension-id');
        doc.head?.appendChild(meta);
    }

    meta.setAttribute('content', extensionId);
    return true;
}

function normalizeOrigin(origin: string): string {
    try {
        const url = new URL(origin);
        return `${url.protocol}//${url.host}`.toLowerCase();
    } catch {
        return origin.trim().toLowerCase().replace(/\/+$/, '');
    }
}

function originHost(value: string): string {
    try {
        return new URL(value).host.toLowerCase();
    } catch {
        return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    }
}

function parseRepositoryIdFromPath(pathname: string): string | null {
    const m = pathname.match(/^\/repositories\/([^/?#]+)\/?$/);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function ensureMeta(doc: DocumentLike, name: string): Element {
    let meta = doc.querySelector(`meta[name="${name}"]`);
    if (!meta) {
        meta = doc.createElement('meta');
        meta.setAttribute('name', name);
        doc.head?.appendChild(meta);
    }
    return meta;
}

export function injectInstalledReleaseMeta(
    doc: DocumentLike,
    repos: InstalledRepoLite[],
    options?: { pathname?: string; origin?: string; allowedMarketOrigins?: string[] }
): boolean {
    const fallbackPath = typeof window !== 'undefined' ? window.location.pathname : '';
    const path = options?.pathname || fallbackPath;
    const repositoryId = parseRepositoryIdFromPath(path);
    if (!repositoryId) return false;
    const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const currentOrigin = normalizeOrigin(options?.origin || fallbackOrigin);
    const currentHost = originHost(currentOrigin);
    const allowedHosts = (options?.allowedMarketOrigins ?? []).map(originHost);
    if (!allowedHosts.includes(currentHost)) return false;

    const matched = repos.find((repo) => (
        repo.repositoryId === repositoryId
        && originHost(repo.marketOrigin || '') === currentHost
    ));
    if (!matched) return false;

    const meta = ensureMeta(doc, 'page-mcp-installed-release');
    meta.setAttribute('content', matched.release);
    return true;
}

// ============================================================
// Page MCP Plugin — Domain Matching Utilities
// ============================================================

/**
 * Check if a hostname matches a domain pattern.
 * Supports wildcard patterns like `*.example.com`.
 */
export function matchesDomainPattern(hostname: string, pattern: string): boolean {
    const host = hostname.toLowerCase();
    const domain = pattern.toLowerCase();
    if (domain.startsWith('*.')) {
        const base = domain.slice(2);
        return host === base || host.endsWith(`.${base}`);
    }
    return host === domain;
}

/**
 * Check if a hostname matches any pattern in the list.
 */
export function isDomainInList(hostname: string, patterns: string[]): boolean {
    return patterns.some(pattern => matchesDomainPattern(hostname, pattern));
}

import type { RemoteInstallRequest, StoredMcpSnapshot } from '../shared/types.js';

export const DEFAULT_MARKET_ORIGINS = [
    'https://market.page-mcp.org',
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function nonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(value);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (isRecord(value)) return value;
    if (typeof value === 'string') return parseJsonObject(value);
    return null;
}

/**
 * Try to read a StoredMcpSnapshot from a record that has { mcp: { tools, prompts, resources } }.
 * Handles both direct layout (value.mcp.tools) and nested layout (value.snapshot.mcp.tools).
 */
function readMcpBucket(value: unknown): StoredMcpSnapshot | null {
    const record = asRecord(value);
    if (!record) return null;

    // Try value.mcp.{tools,prompts,resources}
    const rawMcp = isRecord(record.mcp) ? record.mcp : null;
    if (rawMcp && Array.isArray(rawMcp.tools) && Array.isArray(rawMcp.prompts) && Array.isArray(rawMcp.resources)) {
        return {
            tools: rawMcp.tools as StoredMcpSnapshot['tools'],
            prompts: rawMcp.prompts as StoredMcpSnapshot['prompts'],
            resources: rawMcp.resources as StoredMcpSnapshot['resources'],
        };
    }

    // Try value.snapshot.mcp.{tools,prompts,resources}
    const snapshot = isRecord(record.snapshot) ? record.snapshot : null;
    if (snapshot) {
        const nestedMcp = isRecord(snapshot.mcp) ? snapshot.mcp : null;
        if (nestedMcp && Array.isArray(nestedMcp.tools) && Array.isArray(nestedMcp.prompts) && Array.isArray(nestedMcp.resources)) {
            return {
                tools: nestedMcp.tools as StoredMcpSnapshot['tools'],
                prompts: nestedMcp.prompts as StoredMcpSnapshot['prompts'],
                resources: nestedMcp.resources as StoredMcpSnapshot['resources'],
            };
        }
        // Accept snapshot.mcp as empty-but-valid when skills are present
        if (Array.isArray(snapshot.skills) && !snapshot.mcp) {
            return { tools: [], prompts: [], resources: [] };
        }
    }

    return null;
}

/**
 * Check if the incoming value is a valid installSnapshot payload.
 * Accepts:
 *   - { mcp: { tools, prompts, resources } }           (direct protocol bucket)
 *   - { snapshot: { mcp: { tools, prompts, resources }, skills: [] } }  (full API response)
 *   - { snapshot: { skills: [] } }                     (skills-only, no mcp)
 */
function isInstallSnapshot(value: unknown): boolean {
    return !!readMcpBucket(value);
}

function defaultMcpSnapshot(): StoredMcpSnapshot {
    return { tools: [], prompts: [], resources: [] };
}

function normalizeStoredMcp(value: unknown): StoredMcpSnapshot {
    return readMcpBucket(value) ?? defaultMcpSnapshot();
}

function normalizeInstallSnapshot(value: unknown): RemoteInstallRequest['installSnapshot'] {
    const raw = asRecord(value) ?? {};
    const rawSnapshot = isRecord(raw.snapshot) ? raw.snapshot : null;
    // mcp is always StoredMcpSnapshot — read it from the appropriate location
    const mcp = normalizeStoredMcp(value);
    return {
        repository: isRecord(raw.repository) ? raw.repository as any : {
            id: '',
            name: '',
            description: null,
            siteDomain: '',
            author: { id: '', name: '' },
            starsCount: 0,
            usageCount: 0,
            lastActiveAt: null,
            latestReleaseVersion: null,
        },
        release: isRecord(raw.release) ? raw.release as any : {
            id: '',
            repositoryId: '',
            version: '',
            name: null,
            changelog: null,
            isLatest: false,
            createdAt: '',
        },
        snapshot: {
            mcp,
            skills: rawSnapshot && Array.isArray(rawSnapshot.skills) ? rawSnapshot.skills as any[] : [],
        },
        integrity: isRecord(raw.integrity) ? raw.integrity as any : {
            algorithm: '',
            digest: '',
        },
    };
}

function normalizeOrigin(origin: string): string {
    try {
        const url = new URL(origin);
        return `${url.protocol}//${url.host}`.toLowerCase();
    } catch {
        return origin.trim().toLowerCase().replace(/\/$/, '');
    }
}

export function validateExternalInstall(
    senderOrigin: string | undefined,
    payload: unknown,
    allowedOrigins: string[] = DEFAULT_MARKET_ORIGINS
): { ok: true; payload: RemoteInstallRequest } | { ok: false; error: string } {
    if (!senderOrigin) return { ok: false, error: 'Missing sender origin' };
    const normalizedSenderOrigin = normalizeOrigin(senderOrigin);
    const whitelist = new Set(allowedOrigins.map((item) => normalizeOrigin(item)));
    if (!whitelist.has(normalizedSenderOrigin)) {
        return { ok: false, error: `Origin not allowed: ${normalizedSenderOrigin}` };
    }

    if (!isRecord(payload)) return { ok: false, error: 'Invalid payload' };
    const requiredFields: Array<keyof RemoteInstallRequest> = [
        'repositoryId',
        'repositoryName',
        'siteDomain',
        'release',
        'apiBase',
        'marketOrigin',
        'marketDetailUrl',
    ];
    for (const key of requiredFields) {
        if (!nonEmptyString(payload[key])) {
            return { ok: false, error: `Invalid field: ${key}` };
        }
    }
    const fields = payload as Record<
        'repositoryId' | 'repositoryName' | 'siteDomain' | 'release' | 'apiBase' | 'marketOrigin' | 'marketDetailUrl',
        string
    >;
    if (!isInstallSnapshot(payload.installSnapshot)) {
        const candidate = asRecord(payload.installSnapshot);
        const snapshot = candidate && isRecord(candidate.snapshot) ? candidate.snapshot : candidate;
        const keys = snapshot ? Object.keys(snapshot).join(',') : typeof payload.installSnapshot;
        return { ok: false, error: `Invalid field: installSnapshot (expect snapshot.mcp/snapshot.skills, got: ${keys || 'empty'})` };
    }
    const rawIntegrity = isRecord(payload.integrity) ? payload.integrity : undefined;
    const integrity = rawIntegrity && nonEmptyString(rawIntegrity.algorithm) && nonEmptyString(rawIntegrity.digest)
        ? { algorithm: rawIntegrity.algorithm.trim(), digest: rawIntegrity.digest.trim() }
        : undefined;

    return {
        ok: true,
        payload: {
            repositoryId: fields.repositoryId.trim(),
            repositoryName: fields.repositoryName.trim(),
            siteDomain: fields.siteDomain.trim(),
            release: fields.release.trim(),
            apiBase: fields.apiBase.trim(),
            marketOrigin: normalizeOrigin(fields.marketOrigin),
            marketDetailUrl: fields.marketDetailUrl.trim(),
            mcp: normalizeStoredMcp(payload.installSnapshot),
            installSnapshot: normalizeInstallSnapshot(payload.installSnapshot),
            integrity,
        },
    };
}

import type { RemoteInstallRequest, StoredMcpSnapshot } from '../shared/types.js';
import { toStoredMcpSnapshot } from '../shared/remote-repos.js';

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

function readProtocolMcp(value: unknown): StoredMcpSnapshot | null {
    const record = asRecord(value);
    if (!record) return null;
    const rawMcp = isRecord(record.mcp) ? record.mcp : null;
    if (!rawMcp) return null;
    const tools = rawMcp.tools;
    const prompts = rawMcp.prompts;
    const resources = rawMcp.resources;
    if (!Array.isArray(tools) || !Array.isArray(prompts) || !Array.isArray(resources)) return null;
    return {
        tools: tools as StoredMcpSnapshot['tools'],
        prompts: prompts as StoredMcpSnapshot['prompts'],
        resources: resources as StoredMcpSnapshot['resources'],
    };
}

function readSnapshotArrays(value: unknown): { mcp: unknown[]; skills: unknown[] } | null {
    const record = asRecord(value);
    if (!record) return null;
    const snapshot = isRecord(record.snapshot) ? record.snapshot : record;
    const mcp = snapshot.mcp;
    const skills = snapshot.skills;
    if (!Array.isArray(mcp) || !Array.isArray(skills)) return null;
    return { mcp, skills };
}

function isInstallSnapshot(value: unknown): boolean {
    return !!readProtocolMcp(value) || !!readSnapshotArrays(value);
}

function normalizeInstallSnapshot(value: unknown): RemoteInstallRequest['installSnapshot'] {
    const raw = asRecord(value) ?? {};
    const snapshotRaw = readSnapshotArrays(value) ?? { mcp: [], skills: [] };
    const snapshot = isRecord(raw.snapshot) ? raw.snapshot : raw;
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
            mcp: snapshotRaw.mcp as any[],
            skills: snapshotRaw.skills as any[],
        },
        integrity: isRecord(raw.integrity) ? raw.integrity as any : {
            algorithm: '',
            digest: '',
        },
    };
}

function normalizeStoredMcp(value: unknown): StoredMcpSnapshot {
    const protocolMcp = readProtocolMcp(value);
    if (protocolMcp) return protocolMcp;
    const legacy = readSnapshotArrays(value);
    if (!legacy) return { tools: [], prompts: [], resources: [] };
    return toStoredMcpSnapshot(legacy.mcp as any[]);
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

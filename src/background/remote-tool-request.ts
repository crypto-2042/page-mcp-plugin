import type { PluginSettings } from '../shared/types.js';

type RemoteToolRequest = {
    apiBase: string;
    repositoryId: string;
    toolName: string;
    args: Record<string, unknown>;
};

type FetchLike = typeof fetch;

function normalizeTimeoutSeconds(timeoutSeconds: number): number {
    if (!Number.isFinite(timeoutSeconds)) return 60;
    return Math.max(1, Math.floor(timeoutSeconds));
}

function normalizeRetryCount(enabled: boolean, retries: number): number {
    if (!enabled) return 0;
    if (!Number.isFinite(retries)) return 1;
    return Math.max(0, Math.floor(retries));
}

export async function executeRemoteToolRequest(
    fetchImpl: FetchLike,
    settings: Pick<PluginSettings, 'remoteToolTimeoutSeconds' | 'remoteToolRetryEnabled' | 'remoteToolMaxRetries'>,
    request: RemoteToolRequest
): Promise<{ data?: unknown; error?: string }> {
    const timeoutMs = normalizeTimeoutSeconds(settings.remoteToolTimeoutSeconds) * 1000;
    const maxRetries = normalizeRetryCount(settings.remoteToolRetryEnabled, settings.remoteToolMaxRetries);
    const toolUrl = `${request.apiBase.replace(/\/+$/, '')}/repositories/${request.repositoryId}/tools/${encodeURIComponent(request.toolName)}/execute`;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const response = await fetchImpl(toolUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ args: request.args }),
                signal: controller.signal,
            }).finally(() => clearTimeout(timeoutId));
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = (data as any)?.error?.message || `HTTP ${response.status}`;
                return { error: message };
            }
            return { data };
        } catch (error) {
            if ((error as Error)?.name === 'AbortError') {
                if (attempt < maxRetries) continue;
                return { error: `Remote tool request timeout after ${timeoutMs}ms` };
            }
            return { error: (error as Error)?.message || 'Remote tool request failed' };
        }
    }

    return { error: `Remote tool request timeout after ${timeoutMs}ms` };
}

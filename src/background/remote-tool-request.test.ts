import { describe, expect, it, vi } from 'vitest';
import { executeRemoteToolRequest } from './remote-tool-request.js';

describe('executeRemoteToolRequest', () => {
    it('uses configured timeout and returns data on success', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            json: async () => ({ ok: true }),
        })) as any;

        const result = await executeRemoteToolRequest(fetchImpl, {
            remoteToolTimeoutSeconds: 60,
            remoteToolRetryEnabled: false,
            remoteToolMaxRetries: 1,
        }, {
            apiBase: 'https://api.example.com/v1',
            repositoryId: 'repo-1',
            toolName: 'read_title',
            args: { a: 1 },
        });

        expect(result).toEqual({ data: { ok: true } });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.example.com/v1/repositories/repo-1/tools/read_title/execute');
    });

    it('retries once on timeout when retry is enabled', async () => {
        const timeoutError = Object.assign(new Error('aborted'), { name: 'AbortError' });
        const fetchImpl = vi
            .fn()
            .mockRejectedValueOnce(timeoutError)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ ok: true }),
            }) as any;

        const result = await executeRemoteToolRequest(fetchImpl, {
            remoteToolTimeoutSeconds: 60,
            remoteToolRetryEnabled: true,
            remoteToolMaxRetries: 1,
        }, {
            apiBase: 'https://api.example.com',
            repositoryId: 'repo-1',
            toolName: 'read_title',
            args: {},
        });

        expect(result).toEqual({ data: { ok: true } });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('does not retry non-timeout failures', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error('boom');
        }) as any;

        const result = await executeRemoteToolRequest(fetchImpl, {
            remoteToolTimeoutSeconds: 60,
            remoteToolRetryEnabled: true,
            remoteToolMaxRetries: 3,
        }, {
            apiBase: 'https://api.example.com',
            repositoryId: 'repo-1',
            toolName: 'read_title',
            args: {},
        });

        expect(result).toEqual({ error: 'boom' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('returns timeout error after exhausting retries', async () => {
        const timeoutError = Object.assign(new Error('aborted'), { name: 'AbortError' });
        const fetchImpl = vi.fn(async () => {
            throw timeoutError;
        }) as any;

        const result = await executeRemoteToolRequest(fetchImpl, {
            remoteToolTimeoutSeconds: 45,
            remoteToolRetryEnabled: true,
            remoteToolMaxRetries: 2,
        }, {
            apiBase: 'https://api.example.com',
            repositoryId: 'repo-1',
            toolName: 'read_title',
            args: {},
        });

        expect(result).toEqual({ error: 'Remote tool request timeout after 45000ms' });
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });
});

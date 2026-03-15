import { describe, expect, it, vi } from 'vitest';
import { buildExecutionCatalog } from './execution-catalog.js';

// Mock the remote-tool-executor module
vi.mock('./remote-tool-executor.js', () => ({
    executeRemoteToolInPage: vi.fn(async (_executeStr: string, _args: Record<string, unknown>) => ({ remoteResult: true })),
}));

import { executeRemoteToolInPage } from './remote-tool-executor.js';

describe('buildExecutionCatalog', () => {
    it('executes native tools via mcpClient.callTool', async () => {
        const callTool = vi.fn(async () => ({ ok: true }));

        const catalog = buildExecutionCatalog({
            mcpClient: { callTool } as any,
            tools: [
                { name: 'native-tool', description: 'Native tool', sourceType: 'native', sourceLabel: 'native' },
            ] as any,
        });

        expect(catalog.map((item) => item.displayName)).toEqual(['native-tool']);
        await catalog[0].execute({});
        expect(callTool).toHaveBeenCalledWith('native-tool', {});
    });

    it('executes remote tools via page MAIN world bridge', async () => {
        const callTool = vi.fn(async () => ({ ok: true }));
        const executeStr = '(args) => { return document.title; }';

        const catalog = buildExecutionCatalog({
            mcpClient: { callTool } as any,
            tools: [
                {
                    name: 'remote-tool',
                    description: 'Remote tool',
                    sourceType: 'remote',
                    sourceLabel: 'remote:x',
                    sourceRepositoryId: 'repo-1',
                    execute: executeStr,
                },
            ] as any,
        });

        expect(catalog.map((item) => item.displayName)).toEqual(['remote-tool']);

        await catalog[0].execute({ arg1: 'value1' });
        // Remote tools should NOT call mcpClient.callTool
        expect(callTool).not.toHaveBeenCalled();
        // Remote tools should go through the MAIN world bridge
        expect(executeRemoteToolInPage).toHaveBeenCalledWith(executeStr, { arg1: 'value1' });
        expect(catalog[0].sourceType).toBe('remote');
        expect(catalog[0].sourceRepositoryId).toBe('repo-1');
    });

    it('skips remote tools without execute string', () => {
        const catalog = buildExecutionCatalog({
            mcpClient: null,
            tools: [
                {
                    name: 'no-execute-tool',
                    description: 'Tool without execute',
                    sourceType: 'remote',
                    sourceLabel: 'remote:x',
                    // no execute field
                },
            ] as any,
        });
        expect(catalog).toHaveLength(0);
    });

    it('registers remote tools even when mcpClient is null', () => {
        const catalog = buildExecutionCatalog({
            mcpClient: null,
            tools: [
                {
                    name: 'remote-tool',
                    description: 'Tool',
                    sourceType: 'remote',
                    sourceLabel: 'remote:x',
                    execute: '(args) => args',
                },
            ] as any,
        });
        // Remote tools should be registered even without a native mcpClient
        expect(catalog).toHaveLength(1);
        expect(catalog[0].displayName).toBe('remote-tool');
    });

    it('returns empty catalog for native tools when mcpClient is null', () => {
        const catalog = buildExecutionCatalog({
            mcpClient: null,
            tools: [
                { name: 'some-tool', description: 'Tool', sourceType: 'native', sourceLabel: 'native' },
            ] as any,
        });
        expect(catalog).toHaveLength(0);
    });
});

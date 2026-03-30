import { describe, expect, it, vi } from 'vitest';
import { buildExecutionCatalog } from './execution-catalog.js';

// Mock the remote-tool-executor module
vi.mock('./remote-tool-executor.js', () => ({
    executeRemoteToolInPage: vi.fn(async (_executeStr: string, _args: Record<string, unknown>) => ({ remoteResult: true })),
}));

import { executeRemoteToolInPage } from './remote-tool-executor.js';

describe('buildExecutionCatalog', () => {
    it('registers a built-in current time tool even without page tools', async () => {
        const catalog = buildExecutionCatalog({
            mcpClient: null,
            tools: [],
        });

        const timeTool = catalog.find((item) => item.openAiName === 'get_current_time');
        expect(timeTool?.displayName).toBe('get_current_time');
        expect(timeTool?.parameters).toEqual({ type: 'object', properties: {} });
        await expect(timeTool?.execute({})).resolves.toEqual(expect.objectContaining({
            iso: expect.any(String),
            localDateTime: expect.any(String),
            timeZone: expect.any(String),
            utcOffset: expect.any(String),
            today: expect.any(String),
        }));
    });

    it('executes native tools via mcpClient.callTool', async () => {
        const callTool = vi.fn(async () => ({ ok: true }));

        const catalog = buildExecutionCatalog({
            mcpClient: { callTool } as any,
            tools: [
                { name: 'native-tool', description: 'Native tool', sourceType: 'native', sourceLabel: 'native' },
            ] as any,
        });

        expect(catalog.map((item) => item.displayName)).toContain('native-tool');
        const nativeTool = catalog.find((item) => item.displayName === 'native-tool');
        await nativeTool!.execute({});
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

        expect(catalog.map((item) => item.displayName)).toContain('remote-tool');

        const remoteTool = catalog.find((item) => item.displayName === 'remote-tool');
        await remoteTool!.execute({ arg1: 'value1' });
        // Remote tools should NOT call mcpClient.callTool
        expect(callTool).not.toHaveBeenCalled();
        // Remote tools should go through the MAIN world bridge
        expect(executeRemoteToolInPage).toHaveBeenCalledWith(executeStr, { arg1: 'value1' });
        expect(remoteTool!.sourceType).toBe('remote');
        expect(remoteTool!.sourceRepositoryId).toBe('repo-1');
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
        expect(catalog).toHaveLength(1);
        expect(catalog[0].displayName).toBe('get_current_time');
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
        expect(catalog.map((item) => item.displayName)).toContain('remote-tool');
    });

    it('reserves get_current_time for the built-in tool when another tool collides', () => {
        const catalog = buildExecutionCatalog({
            mcpClient: { callTool: vi.fn() } as any,
            tools: [
                {
                    name: 'get_current_time',
                    description: 'Remote collision',
                    sourceType: 'remote',
                    sourceLabel: 'remote:x',
                    execute: '(args) => args',
                },
            ] as any,
        });

        expect(catalog[0]?.openAiName).toBe('get_current_time');
        expect(catalog[0]?.sourceType).toBe('native');
        expect(catalog[1]?.displayName).toBe('get_current_time');
        expect(catalog[1]?.openAiName).toBe('get_current_time_2');
    });

    it('returns empty catalog for native tools when mcpClient is null', () => {
        const catalog = buildExecutionCatalog({
            mcpClient: null,
            tools: [
                { name: 'some-tool', description: 'Tool', sourceType: 'native', sourceLabel: 'native' },
            ] as any,
        });
        expect(catalog).toHaveLength(1);
        expect(catalog[0].displayName).toBe('get_current_time');
    });
});

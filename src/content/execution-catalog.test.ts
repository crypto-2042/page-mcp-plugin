import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildExecutionCatalog } from './execution-catalog.js';

// Mock the remote-tool-executor module
vi.mock('./remote-tool-executor.js', () => ({
    executeRemoteToolInPage: vi.fn(async (_executeStr: string, _args: Record<string, unknown>) => ({ remoteResult: true })),
}));

import { executeRemoteToolInPage } from './remote-tool-executor.js';

describe('buildExecutionCatalog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('registers a built-in current time tool even without page tools', async () => {
        const catalog = buildExecutionCatalog({
            mcpClient: null,
            tools: [],
        });

        const timeTool = catalog.find((item) => item.openAiName === 'get_current_time');
        expect(timeTool?.displayName).toBe('get_current_time');
        expect(timeTool?.parameters).toEqual({ type: 'object', properties: {} });
        await expect(timeTool?.execute({})).resolves.toEqual(expect.objectContaining({
            content: [{
                type: 'text',
                text: expect.stringContaining('Current local time:'),
            }],
            structuredContent: expect.objectContaining({
                iso: expect.any(String),
                localDateTime: expect.any(String),
                timeZone: expect.any(String),
                utcOffset: expect.any(String),
                today: expect.any(String),
            }),
        }));
    });

    it('filters reserved init tools but keeps normal tools in the catalog', () => {
        const catalog = buildExecutionCatalog({
            mcpClient: { callTool: vi.fn() } as any,
            tools: [
                { name: 'init', description: 'Reserved init tool', sourceType: 'native', sourceLabel: 'native' },
                { name: 'normal-tool', description: 'Normal tool', sourceType: 'native', sourceLabel: 'native' },
            ] as any,
        });

        expect(catalog.map((item) => item.displayName)).not.toContain('init');
        expect(catalog.map((item) => item.displayName)).toContain('normal-tool');
        expect(catalog.map((item) => item.displayName)).toContain('get_current_time');
    });

    it('falls back to a valid OpenAI name for tools with only invalid characters', () => {
        const catalog = buildExecutionCatalog({
            mcpClient: { callTool: vi.fn() } as any,
            tools: [
                { name: '', description: 'Invalid name tool', sourceType: 'native', sourceLabel: 'native' },
            ] as any,
        });

        const tool = catalog.find((item) => item.description === 'Invalid name tool');
        expect(tool?.openAiName).toMatch(/^[a-zA-Z0-9_-]+$/);
        expect(tool?.openAiName).not.toBe('');
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

    it('normalizes native tool execution throws into MCP error results', async () => {
        const callTool = vi.fn(async () => {
            throw new Error('native exploded');
        });

        const catalog = buildExecutionCatalog({
            mcpClient: { callTool } as any,
            tools: [
                { name: 'native-tool', description: 'Native tool', sourceType: 'native', sourceLabel: 'native' },
            ] as any,
        });

        const nativeTool = catalog.find((item) => item.displayName === 'native-tool');
        await expect(nativeTool!.execute({})).resolves.toEqual({
            content: [{ type: 'text', text: 'native exploded' }],
            structuredContent: {
                errorCode: 'tool_error',
                retryRecommended: true,
            },
            isError: true,
        });
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

    it('passes configured remote tool timeout to page MAIN world bridge', async () => {
        const executeStr = '(args) => { return document.title; }';

        const catalog = buildExecutionCatalog({
            mcpClient: { callTool: vi.fn() } as any,
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
            remoteToolTimeoutMs: 60000,
        });

        const remoteTool = catalog.find((item) => item.displayName === 'remote-tool');
        await remoteTool!.execute({ arg1: 'value1' });

        expect(executeRemoteToolInPage).toHaveBeenCalledWith(executeStr, { arg1: 'value1' }, 60000);
    });

    it('normalizes remote tool execution throws into MCP error results', async () => {
        vi.mocked(executeRemoteToolInPage).mockRejectedValueOnce(new Error('remote exploded'));
        const executeStr = '(args) => { return document.title; }';

        const catalog = buildExecutionCatalog({
            mcpClient: { callTool: vi.fn() } as any,
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

        const remoteTool = catalog.find((item) => item.displayName === 'remote-tool');
        await expect(remoteTool!.execute({ arg1: 'value1' })).resolves.toEqual({
            content: [{ type: 'text', text: 'remote exploded' }],
            structuredContent: {
                errorCode: 'tool_error',
                retryRecommended: true,
            },
            isError: true,
        });
    });

    it('marks timeout errors as non-retryable in MCP error results', async () => {
        vi.mocked(executeRemoteToolInPage).mockRejectedValueOnce(new Error('Remote tool execution timeout after 30000ms'));
        const executeStr = '(args) => { return document.title; }';

        const catalog = buildExecutionCatalog({
            mcpClient: { callTool: vi.fn() } as any,
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

        const remoteTool = catalog.find((item) => item.displayName === 'remote-tool');
        await expect(remoteTool!.execute({ arg1: 'value1' })).resolves.toEqual({
            content: [{
                type: 'text',
                text: expect.stringContaining('Do not retry this tool call with the same arguments'),
            }],
            structuredContent: {
                errorCode: 'timeout',
                retryRecommended: false,
            },
            isError: true,
        });
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

    it('returns the built-in current time entry when mcpClient is null', () => {
        const catalog = buildExecutionCatalog({
            mcpClient: null,
            tools: [
                { name: 'some-tool', description: 'Tool', sourceType: 'native', sourceLabel: 'native' },
            ] as any,
        });
        expect(catalog).toHaveLength(1);
        expect(catalog[0].displayName).toBe('get_current_time');
    });

    it('falls back to the default parameters schema for malformed inputSchema values', () => {
        const catalog = buildExecutionCatalog({
            mcpClient: { callTool: vi.fn() } as any,
            tools: [
                {
                    name: 'broken-schema-tool',
                    description: 'Broken schema tool',
                    sourceType: 'native',
                    sourceLabel: 'native',
                    inputSchema: [],
                },
            ] as any,
        });

        const tool = catalog.find((item) => item.displayName === 'broken-schema-tool');
        expect(tool?.parameters).toEqual({ type: 'object', properties: {} });
    });

    it('falls back to the default parameters schema for non-object input schemas', () => {
        const catalog = buildExecutionCatalog({
            mcpClient: { callTool: vi.fn() } as any,
            tools: [
                {
                    name: 'string-schema-tool',
                    description: 'String schema tool',
                    sourceType: 'native',
                    sourceLabel: 'native',
                    inputSchema: { type: 'string' },
                },
            ] as any,
        });

        const tool = catalog.find((item) => item.displayName === 'string-schema-tool');
        expect(tool?.parameters).toEqual({ type: 'object', properties: {} });
    });

    it('uses manifest.inputSchema when top-level inputSchema is absent', () => {
        const manifestSchema = {
            type: 'object',
            properties: {
                query: { type: 'string' },
            },
            required: ['query'],
        };

        const catalog = buildExecutionCatalog({
            mcpClient: { callTool: vi.fn() } as any,
            tools: [
                {
                    name: 'manifest-schema-tool',
                    description: 'Manifest schema tool',
                    sourceType: 'native',
                    sourceLabel: 'native',
                    manifest: {
                        inputSchema: manifestSchema,
                    },
                },
            ] as any,
        });

        const tool = catalog.find((item) => item.displayName === 'manifest-schema-tool');
        expect(tool?.parameters).toEqual(manifestSchema);
    });
});

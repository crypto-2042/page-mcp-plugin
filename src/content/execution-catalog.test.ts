import { describe, expect, it, vi } from 'vitest';
import { buildExecutionCatalog } from './execution-catalog.js';

describe('buildExecutionCatalog', () => {
    it('derives native and remote executable tools from capability buckets', async () => {
        const callTool = vi.fn(async () => ({ ok: true }));
        const getPrompt = vi.fn(async () => ({ messages: [] }));
        const readResource = vi.fn(async () => ({ contents: [] }));
        const executeRemoteTool = vi.fn(async () => ({ remote: true }));
        const executeRemotePrompt = vi.fn(async () => ({ messages: [] }));
        const executeRemoteResource = vi.fn(async () => ({ text: 'remote' }));

        const catalog = buildExecutionCatalog({
            mcpClient: { callTool, getPrompt, readResource } as any,
            tools: [
                { name: 'native-tool', description: 'Native tool', sourceType: 'native', sourceLabel: 'native' },
                { name: 'remote-tool', description: 'Remote tool', sourceType: 'remote', sourceLabel: 'remote:x' },
            ] as any,
            prompts: [
                { name: 'native-prompt', description: 'Native prompt', sourceType: 'native', sourceLabel: 'native' },
                { name: 'remote-prompt', description: 'Remote prompt', sourceType: 'remote', sourceLabel: 'remote:x', manifest: {} },
            ] as any,
            resources: [
                { uri: 'page://title', name: 'Title', description: 'Native resource', sourceType: 'native', sourceLabel: 'native' },
                { uri: 'remote://doc', name: 'Doc', description: 'Remote resource', sourceType: 'remote', sourceLabel: 'remote:x', manifest: {} },
            ] as any,
            executeRemoteTool,
            executeRemotePrompt,
            executeRemoteResource,
        });

        expect(catalog.map((item) => item.displayName)).toEqual([
            'native-tool',
            'native-prompt',
            'Title',
            'remote-tool',
            'remote-prompt',
            'Doc',
        ]);

        await catalog[0].execute({});
        await catalog[3].execute({});
        expect(callTool).toHaveBeenCalledWith('native-tool', {});
        expect(executeRemoteTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'remote-tool' }), {});
    });
});

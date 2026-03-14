import { describe, expect, it, vi } from 'vitest';
import { buildExecutionCatalog } from './execution-catalog.js';

describe('buildExecutionCatalog', () => {
    it('derives native and remote executable tools (tools only, not prompts/resources per MCP spec)', async () => {
        const callTool = vi.fn(async () => ({ ok: true }));
        const executeRemoteTool = vi.fn(async () => ({ remote: true }));

        const catalog = buildExecutionCatalog({
            mcpClient: { callTool } as any,
            tools: [
                { name: 'native-tool', description: 'Native tool', sourceType: 'native', sourceLabel: 'native' },
                { name: 'remote-tool', description: 'Remote tool', sourceType: 'remote', sourceLabel: 'remote:x' },
            ] as any,
            executeRemoteTool,
        });

        // Only tools should be registered — no prompts or resources
        expect(catalog.map((item) => item.displayName)).toEqual([
            'native-tool',
            'remote-tool',
        ]);

        await catalog[0].execute({});
        await catalog[1].execute({});
        expect(callTool).toHaveBeenCalledWith('native-tool', {});
        expect(executeRemoteTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'remote-tool' }), {});
    });
});

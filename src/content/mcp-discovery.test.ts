import { describe, expect, it, vi } from 'vitest';
import { loadNativeMcpState } from './mcp-discovery.js';

describe('loadNativeMcpState', () => {
    it('connects and loads native tools, prompts, and resources', async () => {
        const client = {
            connect: vi.fn(async () => ({ name: 'host-a', version: '1.0.0' })),
            getHostInfo: vi.fn(() => ({ name: 'host-a', version: '1.0.0' })),
            toolsList: vi.fn(async () => ({ items: [{ name: 'tool-a', description: 'Tool A' }] })),
            promptsList: vi.fn(async () => ({ items: [{ name: 'prompt-a', description: 'Prompt A' }] })),
            resourcesList: vi.fn(async () => ({ items: [{ uri: 'page://title', name: 'Title', description: 'Page title' }] })),
        };

        const state = await loadNativeMcpState(client as any);

        expect(client.connect).toHaveBeenCalledTimes(1);
        expect(client.toolsList).toHaveBeenCalledTimes(1);
        expect(client.promptsList).toHaveBeenCalledTimes(1);
        expect(client.resourcesList).toHaveBeenCalledTimes(1);
        expect(state.hostInfo).toEqual({ name: 'host-a', version: '1.0.0' });
        expect(state.tools[0]?.sourceType).toBe('native');
        expect(state.prompts[0]?.sourceType).toBe('native');
        expect(state.resources[0]?.sourceType).toBe('native');
    });

    it('tolerates prompt/resource listing failures', async () => {
        const client = {
            connect: vi.fn(async () => ({ name: 'host-b', version: '1.0.0' })),
            getHostInfo: vi.fn(() => ({ name: 'host-b', version: '1.0.0' })),
            toolsList: vi.fn(async () => ({ items: [{ name: 'tool-a', description: 'Tool A' }] })),
            promptsList: vi.fn(async () => {
                throw new Error('prompts unavailable');
            }),
            resourcesList: vi.fn(async () => {
                throw new Error('resources unavailable');
            }),
        };

        const state = await loadNativeMcpState(client as any);

        expect(state.tools).toHaveLength(1);
        expect(state.prompts).toEqual([]);
        expect(state.resources).toEqual([]);
    });
});

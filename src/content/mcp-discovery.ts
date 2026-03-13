import type { PageMcpClient } from '@page-mcp/core';
import type {
    AnthropicMcpPrompt,
    AnthropicMcpResource,
    AnthropicMcpTool,
} from '@page-mcp/protocol';

type SourceTagged = {
    sourceType: 'native';
    sourceLabel: 'native';
};

export type NativeMcpState = {
    hostInfo: { name: string; version: string };
    tools: Array<AnthropicMcpTool & SourceTagged>;
    prompts: Array<AnthropicMcpPrompt & SourceTagged>;
    resources: Array<AnthropicMcpResource & SourceTagged>;
};

function tagNative<T>(item: T): T & SourceTagged {
    return {
        ...item,
        sourceType: 'native',
        sourceLabel: 'native',
    };
}

export async function loadNativeMcpState(
    client: Pick<PageMcpClient, 'connect' | 'getHostInfo' | 'toolsList' | 'promptsList' | 'resourcesList'>
): Promise<NativeMcpState> {
    const connectedHost = await client.connect();
    const hostInfo = client.getHostInfo() ?? connectedHost;

    const [toolsResult, promptsResult, resourcesResult] = await Promise.all([
        client.toolsList().catch(() => ({ items: [] })),
        client.promptsList().catch(() => ({ items: [] })),
        client.resourcesList().catch(() => ({ items: [] })),
    ]);

    return {
        hostInfo: { name: hostInfo.name, version: hostInfo.version },
        tools: toolsResult.items.map((item) => tagNative(item)),
        prompts: promptsResult.items.map((item) => tagNative(item)),
        resources: resourcesResult.items.map((item) => tagNative(item)),
    };
}

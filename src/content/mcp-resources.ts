import type { ChatMessage } from '../shared/types.js';
import type { AnthropicMcpResource, AnthropicMcpResourceReadResult } from '@page-mcp/protocol';

import { PageMcpHost, EventBus, PageMcpClient } from '@page-mcp/core';

let fallbackClient: PageMcpClient | null = null;
let fallbackHost: PageMcpHost | null = null;

async function getFallbackClient() {
    if (fallbackClient && fallbackHost) {
        return { client: fallbackClient, host: fallbackHost };
    }
    const bus = new EventBus();
    fallbackHost = new PageMcpHost({ name: 'page-mcp-fallback', version: '1.0', transport: bus });
    fallbackHost.start();
    
    fallbackClient = new PageMcpClient({ transport: bus });
    await fallbackClient.connect();
    
    return { client: fallbackClient, host: fallbackHost };
}

export async function readLocalResource(uri: string, resourceDef?: AnthropicMcpResource): Promise<AnthropicMcpResourceReadResult> {
    const { client, host } = await getFallbackClient();
    host.registerResource({
        uri,
        name: resourceDef?.name || uri,
        ...(resourceDef?.description ? { description: resourceDef.description } : {}),
        ...(resourceDef?.mimeType ? { mimeType: resourceDef.mimeType } : {})
    } as any);
    try {
        return await client.readResource(uri);
    } finally {
        host.unregisterResource(uri);
    }
}

export async function buildAttachedResourceMessages(params: {
    selectedUris: string[];
    resources: AnthropicMcpResource[];
    readResource: (uri: string) => Promise<AnthropicMcpResourceReadResult>;
}): Promise<ChatMessage[]> {
    if (params.selectedUris.length === 0) return [];

    const sections: string[] = [];

    for (const uri of params.selectedUris) {
        const resource = params.resources.find((item) => item.uri === uri);
        try {
            const result = await params.readResource(uri);
            const contentText = result.contents
                .map((content) => content.text ?? content.blob ?? '')
                .filter(Boolean)
                .join('\n');
            if (!contentText) continue;
            sections.push(`[${resource?.name ?? uri}]\n${contentText}`);
        } catch {
            continue;
        }
    }

    if (sections.length === 0) return [];

    return [{
        id: `msg_resource_${Date.now()}`,
        role: 'system',
        content: `Attached page resources for this conversation turn:\n\n${sections.join('\n\n')}`,
        timestamp: Date.now(),
        hidden: true,
    }];
}

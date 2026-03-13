import type { ChatMessage } from '../shared/types.js';
import type { AnthropicMcpResource, AnthropicMcpResourceReadResult } from '@page-mcp/protocol';

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

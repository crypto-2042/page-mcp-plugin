import type { AnthropicMcpResource } from '@page-mcp/protocol';

export function getInitialAttachedResourceUris(
    resources: AnthropicMcpResource[],
    defaultAttachedResources: string[] = []
): string[] {
    const allowed = new Set(resources.map((resource) => resource.uri));
    return defaultAttachedResources.filter((uri) => allowed.has(uri));
}

export function toggleAttachedResourceUri(selectedUris: string[], uri: string): string[] {
    return selectedUris.includes(uri)
        ? selectedUris.filter((item) => item !== uri)
        : [...selectedUris, uri];
}

export function getSelectedResourceCountLabel(selectedUris: string[]): string | null {
    return selectedUris.length > 0 ? String(selectedUris.length) : null;
}

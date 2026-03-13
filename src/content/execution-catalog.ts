import type { PageMcpClient } from '@page-mcp/core';
import type {
    AnthropicMcpPrompt,
    AnthropicMcpResource,
    AnthropicMcpTool,
} from '@page-mcp/protocol';

type SourceTagged = {
    sourceType: 'native' | 'remote';
    sourceLabel: string;
};

export type ExecutableTool = {
    openAiName: string;
    displayName: string;
    description: string;
    parameters: Record<string, unknown>;
    outputSchema?: unknown;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
};

type PromptLike = AnthropicMcpPrompt & SourceTagged & {
    manifest?: Record<string, unknown>;
    outputSchema?: unknown;
};

type ToolLike = AnthropicMcpTool & SourceTagged & {
    manifest?: Record<string, unknown>;
    outputSchema?: unknown;
};

type ResourceLike = AnthropicMcpResource & SourceTagged & {
    manifest?: Record<string, unknown>;
    outputSchema?: unknown;
};

function toSafeToolName(prefix: string, raw: string): string {
    return `${prefix}__${raw.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 64);
}

function createUniqueToolName(base: string, used: Set<string>): string {
    let name = base;
    let index = 2;
    while (used.has(name)) {
        const suffix = `_${index}`;
        name = `${base.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
        index += 1;
    }
    used.add(name);
    return name;
}

function promptArgumentsToSchema(prompt: AnthropicMcpPrompt): Record<string, unknown> {
    if (!Array.isArray(prompt.arguments)) return { type: 'object', properties: {} };
    return {
        type: 'object',
        properties: Object.fromEntries(prompt.arguments.map((arg) => [
            arg.name,
            { type: 'string', description: arg.description || arg.name },
        ])),
        required: prompt.arguments.filter((arg) => arg.required).map((arg) => arg.name),
    };
}

export function buildExecutionCatalog(params: {
    mcpClient: Pick<PageMcpClient, 'callTool' | 'getPrompt' | 'readResource'> | null;
    tools: ToolLike[];
    prompts: PromptLike[];
    resources: ResourceLike[];
    executeRemoteTool?: (tool: ToolLike, args: Record<string, unknown>) => Promise<unknown>;
    executeRemotePrompt?: (prompt: PromptLike, args: Record<string, unknown>) => Promise<unknown>;
    executeRemoteResource?: (resource: ResourceLike, args: Record<string, unknown>) => Promise<unknown>;
}): ExecutableTool[] {
    const executableTools: ExecutableTool[] = [];
    const usedToolNames = new Set<string>();

    if (params.mcpClient) {
        for (const tool of params.tools.filter((item) => item.sourceType === 'native')) {
            executableTools.push({
                openAiName: createUniqueToolName(toSafeToolName('tool', tool.name), usedToolNames),
                displayName: tool.name,
                description: tool.description || tool.name,
                parameters: (tool.inputSchema as unknown as Record<string, unknown>) || { type: 'object', properties: {} },
                outputSchema: tool.outputSchema ?? tool.manifest?.outputSchema,
                execute: (args) => params.mcpClient!.callTool(tool.name, args),
            });
        }

        for (const prompt of params.prompts.filter((item) => item.sourceType === 'native')) {
            executableTools.push({
                openAiName: createUniqueToolName(toSafeToolName('prompt', prompt.name), usedToolNames),
                displayName: prompt.name,
                description: prompt.description || `Invoke prompt ${prompt.name}`,
                parameters: promptArgumentsToSchema(prompt),
                outputSchema: prompt.outputSchema ?? prompt.manifest?.outputSchema,
                execute: (args) => params.mcpClient!.getPrompt(prompt.name, args),
            });
        }

        for (const resource of params.resources.filter((item) => item.sourceType === 'native')) {
            executableTools.push({
                openAiName: createUniqueToolName(toSafeToolName('resource', resource.name || resource.uri), usedToolNames),
                displayName: resource.name || resource.uri,
                description: resource.description || `Read resource ${resource.name || resource.uri}`,
                parameters: { type: 'object', properties: {} },
                outputSchema: resource.outputSchema ?? resource.manifest?.outputSchema,
                execute: () => params.mcpClient!.readResource(resource.uri),
            });
        }
    }

    for (const tool of params.tools.filter((item) => item.sourceType === 'remote')) {
        executableTools.push({
            openAiName: createUniqueToolName(toSafeToolName('remote_tool', tool.name), usedToolNames),
            displayName: tool.name,
            description: tool.description || `Execute remote tool ${tool.name}`,
            parameters: ((tool.inputSchema as unknown as Record<string, unknown>) || (tool.manifest?.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} }),
            outputSchema: tool.outputSchema ?? tool.manifest?.outputSchema,
            execute: (args) => {
                if (!params.executeRemoteTool) {
                    throw new Error(`Remote tool execution is unavailable for ${tool.name}`);
                }
                return params.executeRemoteTool(tool, args);
            },
        });
    }

    for (const prompt of params.prompts.filter((item) => item.sourceType === 'remote')) {
        executableTools.push({
            openAiName: createUniqueToolName(toSafeToolName('remote_prompt', prompt.name), usedToolNames),
            displayName: prompt.name,
            description: prompt.description || `Invoke remote prompt ${prompt.name}`,
            parameters: (prompt.manifest?.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} },
            outputSchema: prompt.outputSchema ?? prompt.manifest?.outputSchema,
            execute: (args) => {
                if (!params.executeRemotePrompt) {
                    throw new Error(`Remote prompt execution is unavailable for ${prompt.name}`);
                }
                return params.executeRemotePrompt(prompt, args);
            },
        });
    }

    for (const resource of params.resources.filter((item) => item.sourceType === 'remote')) {
        executableTools.push({
            openAiName: createUniqueToolName(toSafeToolName('remote_resource', resource.name || resource.uri), usedToolNames),
            displayName: resource.name || resource.uri,
            description: resource.description || `Read remote resource ${resource.name || resource.uri}`,
            parameters: (resource.manifest?.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} },
            outputSchema: resource.outputSchema ?? resource.manifest?.outputSchema,
            execute: (args) => {
                if (!params.executeRemoteResource) {
                    throw new Error(`Remote resource execution is unavailable for ${resource.name || resource.uri}`);
                }
                return params.executeRemoteResource(resource, args);
            },
        });
    }

    return executableTools;
}

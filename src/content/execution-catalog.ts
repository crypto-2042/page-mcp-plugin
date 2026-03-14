import type { PageMcpClient } from '@page-mcp/core';
import type {
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

type ToolLike = AnthropicMcpTool & SourceTagged & {
    manifest?: Record<string, unknown>;
    outputSchema?: unknown;
};

/**
 * Sanitize a tool name for OpenAI function calling API.
 * Names must match ^[a-zA-Z0-9_-]+$ and be at most 64 chars.
 */
function sanitizeToolName(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
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

/**
 * Build the execution catalog from MCP capabilities.
 *
 * Per the MCP specification, only **tools** (model-controlled) are registered
 * as OpenAI function-calling tools. Resources (application-controlled) and
 * prompts (user-controlled) are handled through their own dedicated UI paths:
 *   - Resources → user attaches via checkbox → injected as system messages
 *   - Prompts  → user triggers via Quick Actions → messages injected into conversation
 */
export function buildExecutionCatalog(params: {
    mcpClient: Pick<PageMcpClient, 'callTool'> | null;
    tools: ToolLike[];
    executeRemoteTool?: (tool: ToolLike, args: Record<string, unknown>) => Promise<unknown>;
}): ExecutableTool[] {
    const executableTools: ExecutableTool[] = [];
    const usedToolNames = new Set<string>();

    // Native tools — executed via MCP client bridge
    if (params.mcpClient) {
        for (const tool of params.tools.filter((item) => item.sourceType === 'native')) {
            executableTools.push({
                openAiName: createUniqueToolName(sanitizeToolName(tool.name), usedToolNames),
                displayName: tool.name,
                description: tool.description || tool.name,
                parameters: (tool.inputSchema as unknown as Record<string, unknown>) || { type: 'object', properties: {} },
                outputSchema: tool.outputSchema ?? tool.manifest?.outputSchema,
                execute: (args) => params.mcpClient!.callTool(tool.name, args),
            });
        }
    }

    // Remote tools — executed via remote handler
    for (const tool of params.tools.filter((item) => item.sourceType === 'remote')) {
        executableTools.push({
            openAiName: createUniqueToolName(sanitizeToolName(tool.name), usedToolNames),
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

    return executableTools;
}

import type { PageMcpClient } from '@page-mcp/core';
import type {
    AnthropicMcpTool,
} from '@page-mcp/protocol';
import { executeRemoteToolInPage } from './remote-tool-executor.js';
import { getCurrentTime } from './time-tool.js';

type SourceTagged = {
    sourceType: 'native' | 'remote';
    sourceLabel: string;
    sourceRepositoryId?: string;
};

export type ExecutableTool = {
    openAiName: string;
    displayName: string;
    description: string;
    parameters: Record<string, unknown>;
    outputSchema?: unknown;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
    sourceType: SourceTagged['sourceType'];
    sourceLabel: SourceTagged['sourceLabel'];
    sourceRepositoryId?: string;
};

type ToolLike = AnthropicMcpTool & SourceTagged & {
    manifest?: Record<string, unknown>;
    outputSchema?: unknown;
    /** JS function string for remote tools, e.g. `(args) => { ... }` */
    execute?: string | ((...a: unknown[]) => unknown);
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
 *
 * **Native tools** execute via the page MCP bridge (mcpClient.callTool).
 * **Remote tools** (from market-installed repos) carry an `execute` string
 * (a JS function expression) which is evaluated in the page's MAIN world
 * via the bridge script.
 */
export function buildExecutionCatalog(params: {
    mcpClient: Pick<PageMcpClient, 'callTool'> | null;
    tools: ToolLike[];
}): ExecutableTool[] {
    const executableTools: ExecutableTool[] = [];
    const usedToolNames = new Set<string>();

    executableTools.push({
        openAiName: createUniqueToolName('get_current_time', usedToolNames),
        displayName: 'get_current_time',
        description: 'Get the current local date, time, timezone, UTC offset, and today date for this browser environment.',
        parameters: { type: 'object', properties: {} },
        outputSchema: {
            type: 'object',
            properties: {
                iso: { type: 'string' },
                localDateTime: { type: 'string' },
                timeZone: { type: 'string' },
                utcOffset: { type: 'string' },
                today: { type: 'string' },
            },
            required: ['iso', 'localDateTime', 'timeZone', 'utcOffset', 'today'],
            additionalProperties: false,
        },
        execute: async () => getCurrentTime(),
        sourceType: 'native',
        sourceLabel: 'builtin',
    });

    for (const tool of params.tools) {
        if (tool.sourceType === 'remote') {
            // Remote tools → execute via MAIN world bridge
            const executeStr = tool.execute;
            if (typeof executeStr !== 'string' || !executeStr.trim()) {
                console.warn(`[execution-catalog] Remote tool "${tool.name}" has no execute string, skipping`);
                continue;
            }
            executableTools.push({
                openAiName: createUniqueToolName(sanitizeToolName(tool.name), usedToolNames),
                displayName: tool.name,
                description: tool.description || tool.name,
                parameters: (tool.inputSchema as unknown as Record<string, unknown>) || { type: 'object', properties: {} },
                outputSchema: tool.outputSchema ?? tool.manifest?.outputSchema,
                execute: (args) => executeRemoteToolInPage(executeStr, args),
                sourceType: tool.sourceType,
                sourceLabel: tool.sourceLabel,
                sourceRepositoryId: tool.sourceRepositoryId,
            });
        } else if (params.mcpClient) {
            // Native tools → execute via page MCP bridge
            executableTools.push({
                openAiName: createUniqueToolName(sanitizeToolName(tool.name), usedToolNames),
                displayName: tool.name,
                description: tool.description || tool.name,
                parameters: (tool.inputSchema as unknown as Record<string, unknown>) || { type: 'object', properties: {} },
                outputSchema: tool.outputSchema ?? tool.manifest?.outputSchema,
                execute: (args) => params.mcpClient!.callTool(tool.name, args),
                sourceType: tool.sourceType,
                sourceLabel: tool.sourceLabel,
                sourceRepositoryId: tool.sourceRepositoryId,
            });
        }
        // If native tool but no mcpClient → skip (can't execute)
    }

    return executableTools;
}

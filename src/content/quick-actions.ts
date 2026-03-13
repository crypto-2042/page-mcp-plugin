import type {
    AnthropicMcpPrompt as PromptInfo,
    AnthropicMcpResource as ResourceInfo,
    AnthropicMcpTool as ToolInfo,
} from '@page-mcp/protocol';

export type QuickActionKind = 'prompt';

export type QuickActionCandidate = {
    key: string;
    kind: QuickActionKind;
    label: string;
    icon: string;
    name: string;
    promptText?: string;
};

type JsonSchemaLike = {
    required?: string[];
};

type PromptLike = PromptInfo & {
    title?: string;
    prompt?: string;
    manifest?: Record<string, unknown>;
    inputSchema?: JsonSchemaLike;
};

function hasRequiredInSchema(schema: unknown): boolean {
    if (!schema || typeof schema !== 'object') return false;
    const required = (schema as JsonSchemaLike).required;
    return Array.isArray(required) && required.length > 0;
}

function promptRequiresArguments(prompt: PromptLike): boolean {
    if (Array.isArray(prompt.arguments) && prompt.arguments.some((arg) => arg?.required)) return true;
    if (hasRequiredInSchema(prompt.inputSchema)) return true;
    if (hasRequiredInSchema(prompt.manifest && (prompt.manifest as any).inputSchema)) return true;
    const manifestArgs = prompt.manifest && (prompt.manifest as any).arguments;
    if (Array.isArray(manifestArgs) && manifestArgs.some((arg: any) => Boolean(arg?.required))) return true;
    return false;
}

export function buildQuickActionCandidates(params: {
    prompts: PromptLike[];
    tools: ToolInfo[];
    resources: ResourceInfo[];
    maxPrompts?: number;
    maxTools?: number;
    maxResources?: number;
}): QuickActionCandidate[] {
    const {
        prompts,
        tools,
        resources,
        maxPrompts = 3,
        maxTools = 2,
        maxResources = 2,
    } = params;

    const safePrompts = prompts
        .filter((prompt) => !promptRequiresArguments(prompt))
        .slice(0, maxPrompts)
        .map((prompt) => ({
            key: `prompt:${prompt.name}`,
            kind: 'prompt' as const,
            label: prompt.title || prompt.name,
            icon: '⚡',
            name: prompt.name,
            promptText: prompt.prompt,
        }));

    void tools;
    void resources;
    void maxTools;
    void maxResources;

    return safePrompts;
}

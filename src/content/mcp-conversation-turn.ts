import type { ChatMessage } from '../shared/types.js';
import { generateMessageId, generateToolCallId } from '../shared/id.js';
import type { ExecutableTool } from './execution-catalog.js';
import type {
    OpenAiToolDefinition,
    OpenAIChatCompletionResponse,
    OpenAIChatMessage,
    OpenAIStreamEvent,
} from './mcp-openai.js';
import { accumulateToolCallDeltas } from './chat-stream.js';
import { normalizeToolExecutionResult } from './tool-result-normalizer.js';
import { buildTimeSensitivitySystemMessage } from './time-instruction.js';

function createToolMessage(params: {
    toolCallId: string;
    toolName: string;
    displayName: string;
    args: Record<string, unknown>;
    status: 'pending' | 'success' | 'error';
    startedAt?: number;
    finishedAt?: number;
    durationMs?: number;
    result?: unknown;
    error?: string;
}): ChatMessage {
    return {
        id: generateMessageId(),
        role: 'tool',
        content:
            params.status === 'pending'
                ? ''
                : params.status === 'error'
                    ? (params.error || '')
                    : JSON.stringify(params.result ?? null),
        timestamp: params.startedAt ?? params.finishedAt ?? Date.now(),
        toolCallId: params.toolCallId,
        toolCalls: [{
            id: params.toolCallId,
            name: params.displayName || params.toolName,
            args: params.args,
            status: params.status,
            ...(params.startedAt !== undefined ? { startedAt: params.startedAt } : {}),
            ...(params.finishedAt !== undefined ? { finishedAt: params.finishedAt } : {}),
            ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
            ...(params.status === 'error'
                ? { error: params.error, ...(params.result !== undefined ? { result: params.result } : {}) }
                : params.status === 'success'
                    ? { result: params.result }
                    : {}),
        }],
    };
}

function replaceToolMessage(messages: ChatMessage[], nextMessage: ChatMessage): ChatMessage[] {
    return messages.map((message) => (
        message.toolCallId === nextMessage.toolCallId ? nextMessage : message
    ));
}

export async function runMcpConversationTurn(params: {
    conversationMessages: ChatMessage[];
    buildExecutableTools: () => ExecutableTool[];
    toOpenAiMessages: (messages: ChatMessage[]) => OpenAIChatMessage[];
    buildOpenAiTools: (tools: ExecutableTool[]) => OpenAiToolDefinition[];
    formatToolResult: (result: unknown, outputSchema?: unknown) => string;
    callCompletions: (messages: OpenAIChatMessage[], signal?: AbortSignal) => Promise<OpenAIChatCompletionResponse>;
    streamCompletion: (messages: OpenAIChatMessage[], onEvent: (event: OpenAIStreamEvent) => void, tools?: OpenAiToolDefinition[], signal?: AbortSignal) => Promise<void>;
    updateConversation: (messages: ChatMessage[]) => void;
    persistConversation: (messages: ChatMessage[]) => Promise<void>;
    confirmRemoteTool?: (tool: ExecutableTool, args: Record<string, unknown>) => Promise<boolean>;
    signal?: AbortSignal;
}): Promise<ChatMessage[]> {
    let messages = [...params.conversationMessages];
    try {
        const executableTools = params.buildExecutableTools();
        const toolIndex = new Map(executableTools.map((tool) => [tool.openAiName, tool]));
        const openAiTools = params.buildOpenAiTools(executableTools);

        const requestMessages = [
            buildTimeSensitivitySystemMessage(),
            ...params.toOpenAiMessages(messages),
        ];
        let workingMessages: OpenAIChatMessage[] = [...requestMessages];
        const maxToolRounds = openAiTools.length > 0 ? 4 : 1;
        for (let toolRound = 0; toolRound < maxToolRounds; toolRound += 1) {
            let assistantMessageId: string | null = null;
            let streamedText = '';
            const streamedToolCallDeltas: Array<{ index: number; id?: string; type?: 'function'; function?: { name?: string; arguments?: string } }> = [];

            await params.streamCompletion(workingMessages, (event) => {
                if (event.type === 'text-delta') {
                    streamedText += event.delta;
                    if (!assistantMessageId) {
                        assistantMessageId = generateMessageId();
                        messages = [...messages, {
                            id: assistantMessageId,
                            role: 'assistant',
                            content: '',
                            timestamp: Date.now(),
                        }];
                    }
                    messages = messages.map((message) => (
                        message.id === assistantMessageId
                            ? { ...message, content: streamedText }
                            : message
                    ));
                    params.updateConversation(messages);
                    return;
                }

                streamedToolCallDeltas.push(...event.toolCalls);
            }, openAiTools.length > 0 ? openAiTools : undefined, params.signal);

            const toolCalls = accumulateToolCallDeltas(streamedToolCallDeltas);
            if (toolCalls.length === 0) {
                await params.persistConversation(messages);
                return messages;
            }

            if (toolRound === maxToolRounds - 1) {
                throw new Error(`Tool-call rounds exceeded limit (${maxToolRounds})`);
            }

            workingMessages.push({
                role: 'assistant',
                content: streamedText,
                tool_calls: toolCalls,
            });

            for (const call of toolCalls) {
                if (call?.type !== 'function' || !call.function?.name) continue;
                const toolCallId = call.id || generateToolCallId();
                const startedAt = Date.now();
                let args: Record<string, unknown> = {};
                try {
                    args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
                } catch (parseError) {
                    throw new Error(`Invalid tool arguments for ${call.function.name}: ${(parseError as Error).message}`);
                }

                const executable = toolIndex.get(call.function.name);
                if (!executable) {
                    const finishedAt = Date.now();
                    const errorText = `Tool not found: ${call.function.name}`;
                    workingMessages.push({
                        role: 'tool',
                        tool_call_id: toolCallId,
                        content: JSON.stringify({ error: errorText }),
                    });
                    const missingToolMessage = createToolMessage({
                        toolCallId,
                        toolName: call.function.name,
                        displayName: call.function.name,
                        args,
                        status: 'error',
                        startedAt,
                        finishedAt,
                        durationMs: Math.max(0, finishedAt - startedAt),
                        error: errorText,
                    });
                    messages = [...messages, missingToolMessage];
                    params.updateConversation(messages);
                    continue;
                }

                const pendingToolMessage = createToolMessage({
                    toolCallId,
                    toolName: call.function.name,
                    displayName: executable.displayName,
                    args,
                    status: 'pending',
                    startedAt,
                });
                messages = [...messages, pendingToolMessage];
                params.updateConversation(messages);

                try {
                    if (executable.sourceType === 'remote' && params.confirmRemoteTool) {
                        const allowed = await params.confirmRemoteTool(executable, args);
                        if (!allowed) {
                            const finishedAt = Date.now();
                            const errorText = 'User canceled';
                            workingMessages.push({
                                role: 'tool',
                                tool_call_id: toolCallId,
                                content: JSON.stringify({ error: errorText }),
                            });
                            const canceledToolMessage = createToolMessage({
                                toolCallId,
                                toolName: call.function.name,
                                displayName: executable.displayName,
                                args,
                                status: 'error',
                                startedAt,
                                finishedAt,
                                durationMs: Math.max(0, finishedAt - startedAt),
                                error: errorText,
                            });
                            messages = replaceToolMessage(messages, canceledToolMessage);
                            params.updateConversation(messages);
                            continue;
                        }
                    }

                    const result = await executable.execute(args);
                    const finishedAt = Date.now();
                    const normalizedResult = normalizeToolExecutionResult(
                        result,
                        (rawResult) => params.formatToolResult(rawResult, executable.outputSchema),
                    );
                    workingMessages.push({
                        role: 'tool',
                        tool_call_id: toolCallId,
                        content: normalizedResult.modelContent,
                    });
                    const completedToolMessage =
                        normalizedResult.status === 'error'
                            ? createToolMessage({
                                toolCallId,
                                toolName: call.function.name,
                                displayName: executable.displayName,
                                args,
                                status: 'error',
                                startedAt,
                                finishedAt,
                                durationMs: Math.max(0, finishedAt - startedAt),
                                error: normalizedResult.error,
                                result: normalizedResult.result,
                            })
                            : createToolMessage({
                                toolCallId,
                                toolName: call.function.name,
                                displayName: executable.displayName,
                                args,
                                status: 'success',
                                startedAt,
                                finishedAt,
                                durationMs: Math.max(0, finishedAt - startedAt),
                                result: normalizedResult.result,
                            });
                    messages = replaceToolMessage(messages, completedToolMessage);
                    params.updateConversation(messages);
                } catch (toolError) {
                    const finishedAt = Date.now();
                    const errorText = (toolError as Error)?.message || String(toolError);
                    workingMessages.push({
                        role: 'tool',
                        tool_call_id: toolCallId,
                        content: JSON.stringify({ error: errorText }),
                    });
                    const failedToolMessage = createToolMessage({
                        toolCallId,
                        toolName: call.function.name,
                        displayName: executable.displayName,
                        args,
                        status: 'error',
                        startedAt,
                        finishedAt,
                        durationMs: Math.max(0, finishedAt - startedAt),
                        error: errorText,
                    });
                    messages = replaceToolMessage(messages, failedToolMessage);
                    params.updateConversation(messages);
                }
            }

        }

        throw new Error(`Tool-call rounds exceeded limit (${maxToolRounds})`);
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            return messages; // User cancelled, just return current messages without appending error
        }

        const appError: ChatMessage = {
            id: generateMessageId(),
            role: 'assistant',
            content: `**Error:** ${(error as Error).message}`,
            timestamp: Date.now(),
        };
        messages = [...messages, appError];
        await params.persistConversation(messages);
        return messages;
    }
}

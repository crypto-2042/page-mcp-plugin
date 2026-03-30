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
import { buildTimeSensitivitySystemMessage } from './time-instruction.js';

function createToolMessage(params: {
    toolCallId: string;
    toolName: string;
    displayName: string;
    args: Record<string, unknown>;
    status: 'success' | 'error';
    result?: unknown;
    error?: string;
}): ChatMessage {
    return {
        id: generateMessageId(),
        role: 'tool',
        content: params.status === 'error' ? (params.error || '') : JSON.stringify(params.result ?? null),
        timestamp: Date.now(),
        toolCallId: params.toolCallId,
        toolCalls: [{
            id: params.toolCallId,
            name: params.displayName || params.toolName,
            args: params.args,
            status: params.status,
            ...(params.status === 'error' ? { error: params.error } : { result: params.result }),
        }],
    };
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

            const toolMessages: ChatMessage[] = [];
            for (const call of toolCalls) {
                if (call?.type !== 'function' || !call.function?.name) continue;
                const toolCallId = call.id || generateToolCallId();
                let args: Record<string, unknown> = {};
                try {
                    args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
                } catch (parseError) {
                    throw new Error(`Invalid tool arguments for ${call.function.name}: ${(parseError as Error).message}`);
                }

                const executable = toolIndex.get(call.function.name);
                if (!executable) {
                    const errorText = `Tool not found: ${call.function.name}`;
                    workingMessages.push({
                        role: 'tool',
                        tool_call_id: toolCallId,
                        content: JSON.stringify({ error: errorText }),
                    });
                    toolMessages.push(createToolMessage({
                        toolCallId,
                        toolName: call.function.name,
                        displayName: call.function.name,
                        args,
                        status: 'error',
                        error: errorText,
                    }));
                    continue;
                }

                try {
                    if (executable.sourceType === 'remote' && params.confirmRemoteTool) {
                        const allowed = await params.confirmRemoteTool(executable, args);
                        if (!allowed) {
                            const errorText = 'User canceled';
                            workingMessages.push({
                                role: 'tool',
                                tool_call_id: toolCallId,
                                content: JSON.stringify({ error: errorText }),
                            });
                            toolMessages.push(createToolMessage({
                                toolCallId,
                                toolName: call.function.name,
                                displayName: executable.displayName,
                                args,
                                status: 'error',
                                error: errorText,
                            }));
                            continue;
                        }
                    }

                    const result = await executable.execute(args);
                    const toolResultText = params.formatToolResult(result, executable.outputSchema);
                    workingMessages.push({
                        role: 'tool',
                        tool_call_id: toolCallId,
                        content: toolResultText,
                    });
                    toolMessages.push(createToolMessage({
                        toolCallId,
                        toolName: call.function.name,
                        displayName: executable.displayName,
                        args,
                        status: 'success',
                        result,
                    }));
                } catch (toolError) {
                    const errorText = (toolError as Error)?.message || String(toolError);
                    workingMessages.push({
                        role: 'tool',
                        tool_call_id: toolCallId,
                        content: JSON.stringify({ error: errorText }),
                    });
                    toolMessages.push(createToolMessage({
                        toolCallId,
                        toolName: call.function.name,
                        displayName: executable.displayName,
                        args,
                        status: 'error',
                        error: errorText,
                    }));
                }
            }

            if (toolMessages.length > 0) {
                messages = [...messages, ...toolMessages];
                params.updateConversation(messages);
            }

            if (toolMessages.some((message) => message.toolCalls?.some((call) => call.status === 'error'))) {
                await params.persistConversation(messages);
                return messages;
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

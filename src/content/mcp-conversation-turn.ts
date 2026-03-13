import type { ChatMessage } from '../shared/types.js';
import { generateMessageId, generateToolCallId } from '../shared/id.js';
import type { ExecutableTool } from './execution-catalog.js';
import type {
    OpenAiToolDefinition,
    OpenAIChatCompletionResponse,
    OpenAIChatMessage,
    OpenAIResponseMessage,
    OpenAIToolCall,
} from './mcp-openai.js';

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
    callCompletions: (messages: OpenAIChatMessage[]) => Promise<OpenAIChatCompletionResponse>;
    streamCompletion: (messages: OpenAIChatMessage[], onDelta: (delta: string) => void, tools?: OpenAiToolDefinition[]) => Promise<void>;
    updateConversation: (messages: ChatMessage[]) => void;
    persistConversation: (messages: ChatMessage[]) => Promise<void>;
}): Promise<ChatMessage[]> {
    let messages = [...params.conversationMessages];
    try {
        const executableTools = params.buildExecutableTools();
        const toolIndex = new Map(executableTools.map((tool) => [tool.openAiName, tool]));
        const openAiTools = params.buildOpenAiTools(executableTools);

        const requestMessages = params.toOpenAiMessages(messages);
        let workingMessages: OpenAIChatMessage[] = [...requestMessages];
        let responseMessage: OpenAIResponseMessage | undefined;

        if (openAiTools.length > 0) {
            let data = await params.callCompletions(workingMessages);
            responseMessage = data?.choices?.[0]?.message;
            const maxToolRounds = 4;
            let toolRound = 0;
            while (toolRound < maxToolRounds) {
                const toolCalls = Array.isArray(responseMessage?.tool_calls) ? responseMessage.tool_calls : [];
                if (toolCalls.length === 0) break;

                workingMessages.push({
                    role: 'assistant',
                    content: responseMessage?.content || '',
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

                data = await params.callCompletions(workingMessages);
                responseMessage = data?.choices?.[0]?.message;
                toolRound += 1;
            }
            if (Array.isArray(responseMessage?.tool_calls) && responseMessage.tool_calls.length > 0) {
                throw new Error('Tool-call rounds exceeded limit (4)');
            }
        }

        const assistantMessage: ChatMessage = {
            id: generateMessageId(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
        };
        messages = [...messages, assistantMessage];
        params.updateConversation(messages);

        let streamedText = '';
        // Pass tools definitions to the streaming call so LLMs that require
        // tools context when tool-result messages are present don't error out.
        await params.streamCompletion(workingMessages, (delta) => {
            streamedText += delta;
            messages = messages.map((message) => (
                message.id === assistantMessage.id
                    ? { ...message, content: streamedText }
                    : message
            ));
            params.updateConversation(messages);
        }, openAiTools.length > 0 ? openAiTools : undefined);

        if (!streamedText.trim() && responseMessage?.content) {
            messages = messages.map((message) => (
                message.id === assistantMessage.id
                    ? { ...message, content: responseMessage.content || '' }
                    : message
            ));
        }

        await params.persistConversation(messages);
        return messages;
    } catch (error) {
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

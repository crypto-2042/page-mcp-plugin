import type { ChatMessage } from '../shared/types.js';

export async function applyPromptShortcutMessages(params: {
    name: string;
    args?: Record<string, unknown>;
    getPrompt: (name: string, args?: Record<string, unknown>) => Promise<{
        messages: Array<{
            role: 'user' | 'assistant' | 'system';
            content: { type: string; text?: string };
        }>;
    }>;
}): Promise<ChatMessage[]> {
    const promptResult = await params.getPrompt(params.name, params.args);
    const timestamp = Date.now();

    return promptResult.messages
        .filter((message) => message.content.type === 'text' && typeof message.content.text === 'string')
        .map((message, index) => ({
            id: `msg_prompt_${timestamp}_${index}`,
            role: message.role,
            content: message.content.text as string,
            timestamp: timestamp + index,
        }));
}

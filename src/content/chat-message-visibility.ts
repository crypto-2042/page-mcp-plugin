import type { ChatMessage } from '../shared/types.js';

export function filterRenderableMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.filter((message) => !message.hidden);
}

import { describe, expect, it, vi } from 'vitest';
import { applyPromptShortcutMessages } from './mcp-prompt-shortcuts.js';

describe('applyPromptShortcutMessages', () => {
    it('resolves a prompt and appends only text prompt messages to the conversation', async () => {
        const getPrompt = vi.fn(async () => ({
            messages: [
                { role: 'user' as const, content: { type: 'text', text: 'Prompt user text' } },
                { role: 'assistant' as const, content: { type: 'text', text: 'Prompt assistant text' } },
                { role: 'system' as const, content: { type: 'image', data: 'ignored' } as any },
            ],
        }));

        const messages = await applyPromptShortcutMessages({
            name: 'summarize-page',
            getPrompt,
        });

        expect(getPrompt).toHaveBeenCalledWith('summarize-page', undefined);
        expect(messages).toHaveLength(2);
        expect(messages.map((message) => ({ role: message.role, content: message.content }))).toEqual([
            { role: 'user', content: 'Prompt user text' },
            { role: 'assistant', content: 'Prompt assistant text' },
        ]);
    });
});

import type { OpenAIChatMessage } from './mcp-openai.js';

export const TIME_SENSITIVITY_SYSTEM_PROMPT =
    'If the user asks about the current date/time or uses relative dates like today, tomorrow, yesterday, or now, call get_current_time before answering. Prefer absolute dates when time matters.';

export function buildTimeSensitivitySystemMessage(): OpenAIChatMessage {
    return {
        role: 'system',
        content: TIME_SENSITIVITY_SYSTEM_PROMPT,
    };
}

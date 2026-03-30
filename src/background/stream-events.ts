import { parseOpenAIStreamChunk } from '../content/chat-stream.js';

export type BackgroundStreamEvent =
    | { type: 'CHUNK'; delta: string }
    | { type: 'TOOL_CALL_CHUNK'; toolCalls: Array<{ index: number; id?: string; type?: 'function'; function?: { name?: string; arguments?: string } }> }
    | { type: 'DONE' };

export function extractStreamEventsFromBuffer(buffer: string): {
    events: BackgroundStreamEvent[];
    remainder: string;
    done: boolean;
} {
    const events: BackgroundStreamEvent[] = [];
    const lines = buffer.split('\n');
    const remainder = lines.pop() || '';

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) continue;
        const chunk = line.slice(5).trim();
        if (!chunk) continue;

        const result = parseOpenAIStreamChunk(chunk);
        if (result.kind === 'done') {
            events.push({ type: 'DONE' });
            return { events, remainder, done: true };
        }
        if (result.kind === 'text') {
            events.push({ type: 'CHUNK', delta: result.delta });
            continue;
        }
        if (result.kind === 'tool_calls') {
            events.push({ type: 'TOOL_CALL_CHUNK', toolCalls: result.toolCalls });
        }
    }

    return { events, remainder, done: false };
}

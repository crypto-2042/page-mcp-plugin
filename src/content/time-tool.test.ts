import { describe, expect, it, vi } from 'vitest';
import { getCurrentTime } from './time-tool.js';

describe('getCurrentTime', () => {
    it('returns MCP-shaped time metadata with text summary and structured content', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-30T02:31:27.000Z'));

        const result = await getCurrentTime();

        expect(result).toEqual({
            content: [{
                type: 'text',
                text: expect.stringContaining('Current local time:'),
            }],
            structuredContent: {
                iso: '2026-03-30T02:31:27.000Z',
                localDateTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
                today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
                timeZone: expect.any(String),
                utcOffset: expect.stringMatching(/^UTC[+-]\d{2}:\d{2}$/),
            },
        });

        vi.useRealTimers();
    });
});

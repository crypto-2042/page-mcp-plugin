import { describe, expect, it, vi } from 'vitest';
import { getCurrentTime } from './time-tool.js';

describe('getCurrentTime', () => {
    it('returns structured local and UTC time metadata', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-30T02:31:27.000Z'));

        const result = await getCurrentTime();

        expect(result.iso).toBe('2026-03-30T02:31:27.000Z');
        expect(result.localDateTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        expect(result.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(result.timeZone).toBeTypeOf('string');
        expect(result.utcOffset).toMatch(/^UTC[+-]\d{2}:\d{2}$/);

        vi.useRealTimers();
    });
});

import { describe, expect, it } from 'vitest';
import { buildTimeSensitivitySystemMessage, TIME_SENSITIVITY_SYSTEM_PROMPT } from './time-instruction.js';

describe('time instruction helper', () => {
    it('builds a compact system message that nudges time tool usage', () => {
        expect(buildTimeSensitivitySystemMessage()).toEqual({
            role: 'system',
            content: TIME_SENSITIVITY_SYSTEM_PROMPT,
        });
    });
});

import { describe, expect, it } from 'vitest';
import { isExtensionContextInvalidatedError } from './runtime-error.js';

describe('isExtensionContextInvalidatedError', () => {
    it('returns true for chrome invalidated message', () => {
        expect(isExtensionContextInvalidatedError(new Error('Extension context invalidated.'))).toBe(true);
    });

    it('returns false for unrelated error', () => {
        expect(isExtensionContextInvalidatedError(new Error('Network timeout'))).toBe(false);
    });
});

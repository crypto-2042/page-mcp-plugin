import { describe, expect, it } from 'vitest';
import { getSourceBadgeKind, getSourceBadgeText } from './popup-source.js';

describe('popup source label', () => {
    it('returns label when available', () => {
        expect(getSourceBadgeKind({ sourceLabel: 'remote:market.example' })).toBe('remote');
        expect(getSourceBadgeKind({ sourceType: 'native' })).toBe('native');
        expect(getSourceBadgeText({ sourceLabel: 'remote:market.example' })).toBe('Remote');
        expect(getSourceBadgeText({ sourceLabel: 'native' })).toBe('Native');
    });
});

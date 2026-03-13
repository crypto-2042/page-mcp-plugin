import { describe, expect, it } from 'vitest';
import { buildProxyApiUrl } from './proxy-api.js';

describe('buildProxyApiUrl', () => {
    it('joins baseURL and relative endpoint', () => {
        expect(buildProxyApiUrl('https://api.openai.com/v1', '/chat/completions'))
            .toBe('https://api.openai.com/v1/chat/completions');
        expect(buildProxyApiUrl('https://api.openai.com/v1/', 'chat/completions'))
            .toBe('https://api.openai.com/v1/chat/completions');
        expect(buildProxyApiUrl('https://cliproxyapi.example', '/chat/completions'))
            .toBe('https://cliproxyapi.example/v1/chat/completions');
        expect(buildProxyApiUrl('https://cliproxyapi.example', '/models'))
            .toBe('https://cliproxyapi.example/v1/models');
    });

    it('rejects absolute endpoint', () => {
        expect(() => buildProxyApiUrl('https://api.openai.com/v1', 'https://example.com/abc'))
            .toThrowError('Absolute endpoint is not allowed');
    });
});

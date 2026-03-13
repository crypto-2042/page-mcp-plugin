import { describe, expect, it } from 'vitest';
import { addMarketOrigin, filterRemoteRepos, normalizeMarketOrigin, removeMarketOrigin } from './options-remote-services.js';

describe('remote services filter', () => {
    const list = [
        { repositoryName: 'Shop Toolkit', siteDomain: 'shop.example.com' },
        { repositoryName: 'Docs Helper', siteDomain: 'docs.example.com' },
    ] as any;

    it('filters by repository name', () => {
        expect(filterRemoteRepos(list, 'shop')).toHaveLength(1);
    });

    it('filters by site domain', () => {
        expect(filterRemoteRepos(list, 'docs.example.com')).toHaveLength(1);
    });

    it('normalizes market origin and de-duplicates when adding', () => {
        const next = addMarketOrigin(['https://market.page-mcp.org'], 'HTTPs://LOCALHOST:5173/path?a=1');
        expect(next).toEqual(['https://market.page-mcp.org', 'https://localhost:5173']);
        expect(addMarketOrigin(next, 'https://localhost:5173/')).toEqual(next);
        expect(normalizeMarketOrigin('http://127.0.0.1:3000/foo')).toBe('http://127.0.0.1:3000');
    });

    it('removes specific market origin', () => {
        const next = removeMarketOrigin(['https://market.page-mcp.org', 'http://localhost:5173'], 'http://localhost:5173');
        expect(next).toEqual(['https://market.page-mcp.org']);
    });
});

import { describe, expect, it } from 'vitest';
import { buildDomainIndex, lookupRepoIdsForHost } from './remote-repo-index.js';

describe('remote repo domain index', () => {
    it('indexes exact and wildcard domains', () => {
        const index = buildDomainIndex([
            { id: 'r1', siteDomain: 'shop.example.com' },
            { id: 'r2', siteDomain: '*.example.com' },
            { id: 'r3', siteDomain: '*.foo.bar' },
        ] as any);

        expect(lookupRepoIdsForHost(index, 'shop.example.com').sort()).toEqual(['r1', 'r2']);
        expect(lookupRepoIdsForHost(index, 'api.example.com')).toEqual(['r2']);
        expect(lookupRepoIdsForHost(index, 'x.foo.bar')).toEqual(['r3']);
        expect(lookupRepoIdsForHost(index, 'foo.bar')).toEqual(['r3']);
    });
});

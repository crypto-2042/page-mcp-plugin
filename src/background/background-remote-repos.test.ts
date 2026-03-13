import { describe, expect, it } from 'vitest';
import { deleteRemoteRepoById, toggleRemoteRepoEnabled } from './background-remote-repos.js';

describe('background remote repos helpers', () => {
    it('toggles remote repo enabled state', () => {
        const next = toggleRemoteRepoEnabled([
            { id: '1', enabled: true },
            { id: '2', enabled: true },
        ] as any, '1', false);
        expect(next[0].enabled).toBe(false);
        expect(next[1].enabled).toBe(true);
    });

    it('deletes repo by id', () => {
        const next = deleteRemoteRepoById([
            { id: '1', enabled: true },
            { id: '2', enabled: true },
        ] as any, '1');
        expect(next.map((x) => x.id)).toEqual(['2']);
    });
});

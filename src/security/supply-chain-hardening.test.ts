import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');

function readProjectFile(relativePath: string): string {
    return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('supply chain hardening', () => {
    it('does not load remote Google Fonts from extension pages', () => {
        const htmlFiles = [
            'src/popup/index.html',
            'src/options/index.html',
            'src/options/options-mcp-skills.html',
        ];

        for (const relativePath of htmlFiles) {
            const html = readProjectFile(relativePath);
            expect(html).not.toContain('https://fonts.googleapis.com');
            expect(html).not.toContain('https://fonts.gstatic.com');
        }
    });

    it('pins picomatch to a patched version in the lockfile', () => {
        const lockfile = readProjectFile('pnpm-lock.yaml');

        expect(lockfile).toContain('picomatch@4.0.4:');
        expect(lockfile).not.toContain('picomatch@4.0.3:');
        expect(lockfile).not.toContain('picomatch: 4.0.3');
    });
});

import { describe, expect, it } from 'vitest';
import { injectExtensionIdMeta, injectInstalledReleaseMeta } from './market-extension-id.js';

type FakeMeta = {
    attrs: Record<string, string>;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
};

function createMeta(initial: Record<string, string> = {}): FakeMeta {
    const attrs = { ...initial };
    return {
        attrs,
        getAttribute(name: string) {
            return attrs[name] ?? null;
        },
        setAttribute(name: string, value: string) {
            attrs[name] = value;
        },
    };
}

describe('injectExtensionIdMeta', () => {
    it('injects extension id meta when install marker exists', () => {
        const marker = createMeta({ name: 'page-mcp-install-target', content: '1' });
        const headNodes: FakeMeta[] = [];
        const documentLike = {
            querySelector(selector: string) {
                if (selector === 'meta[name="page-mcp-install-target"]') return marker;
                if (selector === 'meta[name="page-mcp-extension-id"]') return null;
                return null;
            },
            createElement() {
                return createMeta();
            },
            head: {
                appendChild(node: FakeMeta) {
                    headNodes.push(node);
                },
            },
        };

        const injected = injectExtensionIdMeta(documentLike as any, 'ext-123');
        expect(injected).toBe(true);
        expect(headNodes[0]?.attrs.name).toBe('page-mcp-extension-id');
        expect(headNodes[0]?.attrs.content).toBe('ext-123');
    });
});

describe('injectInstalledReleaseMeta', () => {
    it('injects installed release meta when whitelist + repository route + market domain/repository match', () => {
        const headNodes: FakeMeta[] = [];
        const documentLike = {
            querySelector(selector: string) {
                if (selector === 'meta[name="page-mcp-installed-release"]') return null;
                return null;
            },
            createElement() {
                return createMeta() as any;
            },
            head: {
                appendChild(node: FakeMeta) {
                    headNodes.push(node);
                },
            },
        };

        const injected = injectInstalledReleaseMeta(
            documentLike as any,
            [
                { repositoryId: 'repo-1', marketOrigin: 'https://market.page-mcp.org', release: 'v2.1.0', updatedAt: 2 },
            ] as any,
            {
                pathname: '/repositories/repo-1',
                origin: 'https://market.page-mcp.org',
                allowedMarketOrigins: ['https://market.page-mcp.org'],
            }
        );
        expect(injected).toBe(true);
        expect(headNodes[0]?.attrs.name).toBe('page-mcp-installed-release');
        expect(headNodes[0]?.attrs.content).toBe('v2.1.0');
    });

    it('does not inject when current market domain is not in whitelist', () => {
        const headNodes: FakeMeta[] = [];
        const documentLike = {
            querySelector() {
                return null;
            },
            createElement() {
                return createMeta() as any;
            },
            head: {
                appendChild(node: FakeMeta) {
                    headNodes.push(node);
                },
            },
        };

        const injected = injectInstalledReleaseMeta(
            documentLike as any,
            [{ repositoryId: 'repo-1', marketOrigin: 'https://market.page-mcp.org', release: 'v2.1.0' }] as any,
            {
                pathname: '/repositories/repo-1',
                origin: 'https://market.page-mcp.org',
                allowedMarketOrigins: ['https://other-market.example'],
            }
        );
        expect(injected).toBe(false);
        expect(headNodes.length).toBe(0);
    });

    it('does not inject on non repository detail route', () => {
        const headNodes: FakeMeta[] = [];
        const documentLike = {
            querySelector() {
                return null;
            },
            createElement() {
                return createMeta() as any;
            },
            head: {
                appendChild(node: FakeMeta) {
                    headNodes.push(node);
                },
            },
        };

        const injected = injectInstalledReleaseMeta(
            documentLike as any,
            [{ repositoryId: 'repo-1', marketOrigin: 'https://market.page-mcp.org', release: 'v2.1.0' }] as any,
            {
                pathname: '/repositories/repo-1/versions',
                origin: 'https://market.page-mcp.org',
                allowedMarketOrigins: ['https://market.page-mcp.org'],
            }
        );
        expect(injected).toBe(false);
        expect(headNodes.length).toBe(0);
    });
});

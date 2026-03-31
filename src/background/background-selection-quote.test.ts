import { beforeEach, describe, expect, it, vi } from 'vitest';

const contextMenusCreate = vi.fn();
const contextMenusRemoveAll = vi.fn();
const contextMenusOnClickedAddListener = vi.fn();
const runtimeOnMessageAddListener = vi.fn();
const runtimeOnMessageExternalAddListener = vi.fn();
const runtimeOnConnectAddListener = vi.fn();
const runtimeOnInstalledAddListener = vi.fn();
const runtimeOnStartupAddListener = vi.fn();
const runtimeOpenOptionsPage = vi.fn();
const tabsSendMessage = vi.fn(async () => ({}));
const actionOnClickedAddListener = vi.fn();

let contextMenuClickedHandler: ((info: { selectionText?: string }) => void | Promise<void>) | null = null;
let installedHandler: (() => void | Promise<void>) | null = null;
let startupHandler: (() => void | Promise<void>) | null = null;

function installChromeMock() {
    vi.stubGlobal('chrome', {
        contextMenus: {
            create: contextMenusCreate,
            removeAll: contextMenusRemoveAll,
            onClicked: {
                addListener: (listener: (info: { selectionText?: string }) => void | Promise<void>) => {
                    contextMenuClickedHandler = listener;
                    contextMenusOnClickedAddListener(listener);
                },
            },
        },
        runtime: {
            onMessage: {
                addListener: runtimeOnMessageAddListener,
            },
            onMessageExternal: {
                addListener: runtimeOnMessageExternalAddListener,
            },
            onConnect: {
                addListener: runtimeOnConnectAddListener,
            },
            onInstalled: {
                addListener: (listener: () => void | Promise<void>) => {
                    installedHandler = listener;
                    runtimeOnInstalledAddListener(listener);
                },
            },
            onStartup: {
                addListener: (listener: () => void | Promise<void>) => {
                    startupHandler = listener;
                    runtimeOnStartupAddListener(listener);
                },
            },
            openOptionsPage: runtimeOpenOptionsPage,
            getURL: (path: string) => `chrome-extension://test/${path}`,
        },
        tabs: {
            sendMessage: tabsSendMessage,
            query: vi.fn(async () => []),
            create: vi.fn(),
        },
        action: {
            onClicked: {
                addListener: actionOnClickedAddListener,
            },
            setBadgeText: vi.fn(),
            setBadgeBackgroundColor: vi.fn(),
        },
    } as any);
}

async function loadBackgroundModule() {
    vi.resetModules();
    installChromeMock();
    await import('./index.js');
}

beforeEach(() => {
    vi.clearAllMocks();
    contextMenuClickedHandler = null;
    installedHandler = null;
    startupHandler = null;
});

describe('background selection quote context menu', () => {
    it('registers restart-safe startup and install handlers', async () => {
        await loadBackgroundModule();

        expect(contextMenusCreate).not.toHaveBeenCalled();
        expect(runtimeOnInstalledAddListener).toHaveBeenCalledTimes(1);
        expect(runtimeOnStartupAddListener).toHaveBeenCalledTimes(1);
        expect(contextMenusOnClickedAddListener).toHaveBeenCalledTimes(1);
    });

    it('recreates the selection quote context menu on startup without duplicates', async () => {
        await loadBackgroundModule();

        await startupHandler?.();
        await startupHandler?.();

        expect(contextMenusRemoveAll).toHaveBeenCalledTimes(2);
        expect(contextMenusCreate).toHaveBeenCalledTimes(2);
        expect(contextMenusCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
            id: 'pmcp-add-selection-quote',
            contexts: ['selection'],
        }));
    });

    it('ignores blank selection text', async () => {
        await loadBackgroundModule();

        await contextMenuClickedHandler?.({ selectionText: '   ' });

        expect(tabsSendMessage).not.toHaveBeenCalled();
    });
});

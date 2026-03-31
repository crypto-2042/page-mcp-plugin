import { beforeEach, describe, expect, it, vi } from 'vitest';

const contextMenusCreate = vi.fn();
const contextMenusRemoveAll = vi.fn();
const contextMenusOnClickedAddListener = vi.fn();
const runtimeOnMessageAddListener = vi.fn();
const runtimeOnMessageExternalAddListener = vi.fn();
const runtimeOnConnectAddListener = vi.fn();
const runtimeOpenOptionsPage = vi.fn();
const tabsSendMessage = vi.fn(async () => ({}));
const actionOnClickedAddListener = vi.fn();

let contextMenuClickedHandler: ((info: { selectionText?: string }) => void | Promise<void>) | null = null;

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
});

describe('background selection quote context menu', () => {
    it('creates the selection quote context menu with selection context', async () => {
        await loadBackgroundModule();

        expect(contextMenusCreate).toHaveBeenCalledWith(expect.objectContaining({
            id: 'pmcp-add-selection-quote',
            contexts: ['selection'],
        }));
        expect(contextMenusOnClickedAddListener).toHaveBeenCalledTimes(1);
    });

    it('ignores blank selection text', async () => {
        await loadBackgroundModule();

        await contextMenuClickedHandler?.({ selectionText: '   ' });

        expect(tabsSendMessage).not.toHaveBeenCalled();
    });
});

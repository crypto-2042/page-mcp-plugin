import { useEffect, useRef, useState } from 'react';
import type {
    AnthropicMcpPrompt as PromptInfo,
    AnthropicMcpResource as ResourceInfo,
    AnthropicMcpTool as ToolInfo,
} from '@page-mcp/protocol';
import { PostMessageTransport, PageMcpClient } from '@page-mcp/core';
import type { InstalledRemoteRepository, PluginSettings } from '../../shared/types.js';
import { PM_CHANNEL } from '../../shared/constants.js';
import { safeRuntimeMessage } from '../safe-runtime.js';
import { injectExtensionIdMeta } from '../market-extension-id.js';
import { loadNativeMcpState } from '../mcp-discovery.js';
import { collectRemoteRepositoryContent, mergeWithSourceLabels } from '../remote-content.js';

type WithSource<T> = T & {
    sourceType: 'native';
    sourceLabel: 'native';
};

type CapabilityState = {
    tools: Array<WithSource<ToolInfo>>;
    prompts: Array<WithSource<PromptInfo>>;
    resources: Array<WithSource<ResourceInfo>>;
    hostInfo: { name: string; version: string };
};

const devWarn = (...args: unknown[]) => {
    if (import.meta.env.DEV) {
        console.warn(...args);
    }
};

const EMPTY_HOST = { name: 'remote-only', version: '1.0.0' };

export function useMcpDiscovery(settings: PluginSettings, isSettingsLoaded: boolean) {
    const [mcpClient, setMcpClient] = useState<PageMcpClient | null>(null);
    const [tools, setTools] = useState<WithSource<ToolInfo>[]>([]);
    const [prompts, setPrompts] = useState<WithSource<PromptInfo>[]>([]);
    const [resources, setResources] = useState<WithSource<ResourceInfo>[]>([]);
    const [hasNativeChat, setHasNativeChat] = useState(false);

    const toolsRef = useRef<WithSource<ToolInfo>[]>([]);
    const promptsRef = useRef<WithSource<PromptInfo>[]>([]);
    const resourcesRef = useRef<WithSource<ResourceInfo>[]>([]);
    const skillsRef = useRef<any[]>([]);
    const installedReposRef = useRef<InstalledRemoteRepository[]>([]);
    const nativeBaseRef = useRef<CapabilityState>({
        tools: [], prompts: [], resources: [], hostInfo: EMPTY_HOST,
    });
    const refreshByPathRef = useRef<(() => Promise<void>) | null>(null);
    const lastPathRef = useRef<string>(window.location.pathname);

    toolsRef.current = tools;
    promptsRef.current = prompts;
    resourcesRef.current = resources;
    // skillsRef is updated directly inside refreshByPath — no state needed for popup queries

    useEffect(() => {
        if (!isSettingsLoaded) return;

        const applyCapabilities = (
            next: { tools: Array<WithSource<ToolInfo>>; prompts: Array<WithSource<PromptInfo>>; resources: Array<WithSource<ResourceInfo>>; skills: any[] },
            hostInfo: { name: string; version: string }
        ) => {
            setTools(next.tools);
            setPrompts(next.prompts);
            setResources(next.resources);
            skillsRef.current = next.skills;
            safeRuntimeMessage('MCP_DETECTED', {
                type: 'MCP_DETECTED',
                hostInfo,
                toolCount: next.tools.length + next.prompts.length + next.resources.length,
            });
        };

        const refreshByPath = async () => {
            const base = nativeBaseRef.current;
            const hasNativeBase = base.tools.length > 0 || base.prompts.length > 0 || base.resources.length > 0;

            // Load market-installed repositories for current hostname
            const hostname = window.location.hostname;
            const pathname = window.location.pathname;
            let marketRepos: InstalledRemoteRepository[] = [];
            try {
                const repoResp = await chrome.runtime.sendMessage({
                    type: 'LIST_MCP_SKILLS_REPOS',
                    hostname,
                });
                if (repoResp?.type === 'MCP_SKILLS_REPOS_RESULT' && Array.isArray(repoResp.items)) {
                    marketRepos = repoResp.items;
                }
            } catch (e) {
                // background may not be available — degrade gracefully
            }

            // Apply domain + path matching for each enabled repo
            const remoteContent = collectRemoteRepositoryContent(marketRepos, hostname, pathname);
            installedReposRef.current = marketRepos;

            // Merge native and remote capabilities
            const merged = mergeWithSourceLabels(
                {
                    tools: base.tools,
                    prompts: base.prompts,
                    resources: base.resources,
                    skills: [],
                },
                remoteContent
            );

            applyCapabilities({
                tools: merged.tools as Array<WithSource<ToolInfo>>,
                prompts: merged.prompts as Array<WithSource<PromptInfo>>,
                resources: merged.resources as Array<WithSource<ResourceInfo>>,
                skills: merged.skills,
            }, hasNativeBase ? base.hostInfo : EMPTY_HOST);
        };
        refreshByPathRef.current = refreshByPath;

        const init = async () => {
            try {
                injectExtensionIdMeta(document, chrome.runtime.id);
            } catch (e) {
                console.warn('[Page MCP Content] inject extension id meta failed:', e);
            }

            const nativeChat = !!document.getElementById('page-mcp-chat-widget');
            setHasNativeChat(nativeChat);
            safeRuntimeMessage('PAGE_CHAT_STATUS', { type: 'PAGE_CHAT_STATUS', hasNativeChat: nativeChat, domain: window.location.hostname });

            // Immediately load market-installed repos (no need to wait for native bridge)
            await refreshByPath();

            if (settings.autoDetect) {
                console.log('[Page MCP Content] Starting MCP detection...');
                const transport = new PostMessageTransport({ channel: PM_CHANNEL + '-ext-bridge', role: 'client', timeout: 10000 });
                const client = new PageMcpClient({ transport, connectTimeout: 10000 });

                let bridgeReady = false;
                const onMsg = (e: MessageEvent) => {
                    if (e.data?.channel === PM_CHANNEL + '-ext-bridge' && e.data?.type === 'bridge:ready') {
                        bridgeReady = true;
                        console.log('[Page MCP Content] Bridge ready received');
                    }
                };
                window.addEventListener('message', onMsg);

                const maxWaitMs = 8000;
                const pollMs = 500;
                for (let waited = 0; waited < maxWaitMs && !bridgeReady; waited += pollMs) {
                    window.postMessage({
                        channel: PM_CHANNEL + '-ext-bridge',
                        type: 'bridge:ping',
                        payload: {},
                    }, '*');
                    await new Promise(r => setTimeout(r, pollMs));
                }

                window.removeEventListener('message', onMsg);
                console.log('[Page MCP Content] Bridge ready:', bridgeReady);

                if (!bridgeReady) {
                    const hasNativeWidget = !!document.getElementById('page-mcp-chat-widget');
                    if (!hasNativeWidget) {
                        devWarn('[Page MCP Content] Bridge ready signal not observed; skip native MCP connect');
                        // Still load market-installed repositories even without a native bridge
                        await refreshByPath();
                        return;
                    }
                    devWarn('[Page MCP Content] Bridge ready signal not observed; native widget detected, attempt connect once');
                }
                try {
                    const nativeState = await loadNativeMcpState(client);
                    console.log('[Page MCP Content] Client connected, host:', nativeState.hostInfo);
                    setMcpClient(client);
                    const host = nativeState.hostInfo;
                    nativeBaseRef.current = {
                        tools: nativeState.tools as Array<WithSource<ToolInfo>>,
                        prompts: nativeState.prompts as Array<WithSource<PromptInfo>>,
                        resources: nativeState.resources,
                        hostInfo: host,
                    };
                    // After updating native base, run a full refresh (includes remote repos)
                    await refreshByPath();
                } catch (e) {
                    devWarn('[Page MCP Content] Client connect failed:', e);
                    setMcpClient(null);
                    nativeBaseRef.current = { tools: [], prompts: [], resources: [], hostInfo: EMPTY_HOST };
                    await refreshByPath();
                }
            } else {
                // autoDetect is off — still load market-installed repositories
                await refreshByPath();
            }
        };

        init();

        // MutationObserver — scoped to body with debounce (P2 #12 improvement)
        let mutationTimer: ReturnType<typeof setTimeout> | null = null;
        const observer = new MutationObserver(() => {
            if (mutationTimer) clearTimeout(mutationTimer);
            mutationTimer = setTimeout(() => {
                const native = !!document.getElementById('page-mcp-chat-widget');
                setHasNativeChat(native);
            }, 200);
        });
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }

        // Path change detection
        const emitPathChange = () => window.dispatchEvent(new Event('pmcp:pathchange'));
        const maybeEmitPathChange = () => {
            const next = window.location.pathname;
            if (next === lastPathRef.current) return;
            lastPathRef.current = next;
            emitPathChange();
        };
        const onPathChange = () => {
            refreshByPathRef.current?.().catch((err) => {
                console.warn('[Page MCP Content] refresh on path change failed:', err);
            });
        };
        window.addEventListener('pmcp:pathchange', onPathChange);
        window.addEventListener('popstate', onPathChange);
        window.addEventListener('hashchange', onPathChange);
        document.addEventListener('turbo:load', maybeEmitPathChange as EventListener);
        document.addEventListener('pjax:end', maybeEmitPathChange as EventListener);
        const pathWatchTimer = window.setInterval(maybeEmitPathChange, 300);

        // Respond to capability queries from popup
        const onQueryMsg = (msg: { type: string }, _sender: unknown, sendResponse: (response?: unknown) => void) => {
            if (msg.type === 'QUERY_PAGE_CHAT_STATUS') {
                sendResponse({ ok: true });
                return true;
            }
            if (msg.type === 'QUERY_PAGE_MCP_CAPABILITIES') {
                sendResponse({
                    ok: true,
                    data: {
                        tools: toolsRef.current,
                        prompts: promptsRef.current,
                        resources: resourcesRef.current,
                        skills: skillsRef.current,
                    },
                });
                return true;
            }
        };
        chrome.runtime.onMessage.addListener(onQueryMsg);

        // Settings changes trigger capability refresh
        const onSettingsChange = (msg: { type: string }) => {
            if (msg.type === 'SETTINGS_CHANGED') {
                refreshByPathRef.current?.().catch(() => { });
            }
        };
        chrome.runtime.onMessage.addListener(onSettingsChange);

        return () => {
            observer.disconnect();
            if (mutationTimer) clearTimeout(mutationTimer);
            chrome.runtime.onMessage.removeListener(onQueryMsg);
            chrome.runtime.onMessage.removeListener(onSettingsChange);
            window.removeEventListener('pmcp:pathchange', onPathChange);
            window.removeEventListener('popstate', onPathChange);
            window.removeEventListener('hashchange', onPathChange);
            document.removeEventListener('turbo:load', maybeEmitPathChange as EventListener);
            document.removeEventListener('pjax:end', maybeEmitPathChange as EventListener);
            window.clearInterval(pathWatchTimer);
        };
    }, [isSettingsLoaded]);

    return { mcpClient, tools, prompts, resources, hasNativeChat, installedReposRef };
}

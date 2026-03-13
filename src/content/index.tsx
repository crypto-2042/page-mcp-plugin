import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PostMessageTransport, PageMcpClient } from '@page-mcp/core';
import type {
    AnthropicMcpPrompt as PromptInfo,
    AnthropicMcpResource as ResourceInfo,
    AnthropicMcpTool as ToolInfo,
} from '@page-mcp/protocol';
import { PM_CHANNEL, MAX_QUICK_PROMPTS } from '../shared/constants.js';
import { DEFAULT_SETTINGS, PluginSettings, Conversation, ChatMessage } from '../shared/types.js';
import { generatePluginStyles } from './styles.js';
import { renderMarkdown } from './markdown.js';
import { formatToolResult } from './tool-result-format.js';
import { buildQuickActionCandidates } from './quick-actions.js';
import { isExtensionContextInvalidatedError } from './runtime-error.js';
import { injectExtensionIdMeta } from './market-extension-id.js';
import { buildExecutionCatalog, type ExecutableTool } from './execution-catalog.js';
import { loadNativeMcpState } from './mcp-discovery.js';
import { buildAttachedResourceMessages } from './mcp-resources.js';
import { applyPromptShortcutMessages } from './mcp-prompt-shortcuts.js';
import {
    getInitialAttachedResourceUris,
    getSelectedResourceCountLabel,
    toggleAttachedResourceUri,
} from './mcp-resource-selection.js';
import {
    buildOpenAiToolsFromCatalog,
    toOpenAiConversationMessages,
    type OpenAIChatCompletionResponse,
    type OpenAIChatMessage,
    type OpenAIResponseMessage,
} from './mcp-openai.js';
import { filterRenderableMessages } from './chat-message-visibility.js';
import { getToolCallResultPayload } from './tool-call-display.js';
import { runMcpConversationTurn } from './mcp-conversation-turn.js';
import { createMcpChatRuntime } from './mcp-chat-runtime.js';
import { runChatAction } from './mcp-chat-actions.js';

// Icons
import { MessageSquare, X, Send, Clock, Plus, Settings as SettingsIcon, Trash2, ChevronDown, ChevronUp, Layers3 } from 'lucide-react';

const currentDomain = window.location.hostname;
type WithSource<T> = T & {
    sourceType: 'native';
    sourceLabel: 'native';
};
type StreamPortMessage =
    | { type: 'CHUNK'; delta: string }
    | { type: 'DONE' }
    | { type: 'ERROR'; error: string };
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

const ChatWidget = () => {
    const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
    const [mcpClient, setMcpClient] = useState<PageMcpClient | null>(null);
    const [tools, setTools] = useState<WithSource<ToolInfo>[]>([]);
    const [prompts, setPrompts] = useState<WithSource<PromptInfo>[]>([]);
    const [resources, setResources] = useState<WithSource<ResourceInfo>[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);

    // UI State
    const [panelOpen, setPanelOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [quickActionsOpen, setQuickActionsOpen] = useState(false);
    const [resourcePanelOpen, setResourcePanelOpen] = useState(false);
    const [hasNativeChat, setHasNativeChat] = useState(false);
    const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
    const [widgetVisible, setWidgetVisible] = useState(false);

    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [attachedResourceUris, setAttachedResourceUris] = useState<string[]>([]);
    const [expandedToolDetails, setExpandedToolDetails] = useState<Record<string, boolean>>({});
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const qaHovered = useRef(false);
    const settingsRef = useRef<PluginSettings>(DEFAULT_SETTINGS);
    const nativeBaseRef = useRef<CapabilityState>({
        tools: [],
        prompts: [],
        resources: [],
        hostInfo: { name: 'remote-only', version: '1.0.0' },
    });
    const refreshByPathRef = useRef<(() => Promise<void>) | null>(null);
    const lastPathRef = useRef<string>(window.location.pathname);
    const extensionContextInvalidatedRef = useRef(false);

    const logRuntimeError = (context: string, error: unknown) => {
        if (isExtensionContextInvalidatedError(error)) {
            extensionContextInvalidatedRef.current = true;
            return;
        }
        devWarn(`[Page MCP Content] ${context} failed:`, error);
    };

    const safeRuntimeMessage = async <T,>(context: string, payload: any): Promise<T | undefined> => {
        if (extensionContextInvalidatedRef.current) return undefined;
        try {
            return await chrome.runtime.sendMessage(payload) as T;
        } catch (error) {
            logRuntimeError(context, error);
            return undefined;
        }
    };

    // Refs to keep latest MCP data accessible in chrome.runtime.onMessage listener
    const toolsRef = useRef<WithSource<ToolInfo>[]>([]);
    const promptsRef = useRef<WithSource<PromptInfo>[]>([]);
    const resourcesRef = useRef<WithSource<ResourceInfo>[]>([]);
    toolsRef.current = tools;
    promptsRef.current = prompts;
    resourcesRef.current = resources;

    const activeConv = conversations.find(c => c.id === activeConvId);

    // Initialization

    const [dict, setDict] = useState<Record<string, { message: string }>>({});

    useEffect(() => {
        // In content scripts on arbitrary pages, fetching extension locale files can be blocked
        // by web_accessible_resources. chrome.i18n remains available, so keep dict empty here.
        setDict({});
    }, [settings?.language]);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    const t = (key: string, subs?: Record<string, string> | any) => {
        let msg = dict[key]?.message;
        if (!msg) {
            try {
                msg = chrome.i18n.getMessage(key);
            } catch (e) { }
        }
        msg = msg || key;
        if (subs && typeof subs === 'object' && !Array.isArray(subs)) {
            Object.entries(subs).forEach(([k, v]) => {
                msg = msg.replace('{' + k + '}', String(v));
            });
        }
        return msg;
    };

    const stopPageShortcutPropagation = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        const native = e.nativeEvent as KeyboardEvent;
        if (typeof native.stopImmediatePropagation === 'function') {
            native.stopImmediatePropagation();
        }
    };


    useEffect(() => {
        const applyCapabilities = (
            next: {
                tools: Array<WithSource<ToolInfo>>;
                prompts: Array<WithSource<PromptInfo>>;
                resources: Array<WithSource<ResourceInfo>>;
            },
            hostInfo: { name: string; version: string }
        ) => {
            setTools(next.tools);
            setPrompts(next.prompts);
            setResources(next.resources);
            safeRuntimeMessage('MCP_DETECTED', {
                type: 'MCP_DETECTED',
                hostInfo,
                toolCount: next.tools.length + next.prompts.length + next.resources.length,
            });
        };

        const refreshByPath = async () => {
            const base = nativeBaseRef.current;
            const hasNativeBase = base.tools.length > 0 || base.prompts.length > 0 || base.resources.length > 0;
            applyCapabilities({
                tools: base.tools,
                prompts: base.prompts,
                resources: base.resources,
            }, hasNativeBase ? base.hostInfo : { name: 'remote-only', version: '1.0.0' });
        };

        refreshByPathRef.current = refreshByPath;

        const init = async () => {
            let s = { ...DEFAULT_SETTINGS };
            const settingsRes = await safeRuntimeMessage<{ settings?: PluginSettings }>('GET_SETTINGS', { type: 'GET_SETTINGS' });
            if (settingsRes?.settings) s = settingsRes.settings;
            setSettings(s);
            settingsRef.current = s;

            try {
                injectExtensionIdMeta(document, chrome.runtime.id);
            } catch (e) {
                console.warn('[Page MCP Content] inject extension id meta failed:', e);
            }
            const conversationsRes = await safeRuntimeMessage<{ conversations?: Conversation[] }>(
                'GET_CONVERSATIONS',
                { type: 'GET_CONVERSATIONS', domain: currentDomain }
            );
            if (conversationsRes?.conversations) setConversations(conversationsRes.conversations);

            const nativeChat = !!document.getElementById('page-mcp-chat-widget');
            setHasNativeChat(nativeChat);

            safeRuntimeMessage('PAGE_CHAT_STATUS', { type: 'PAGE_CHAT_STATUS', hasNativeChat: nativeChat, domain: currentDomain });

            if (s.autoDetect) {
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

                // Poll for bridge:ready up to 8 seconds (the bridge polls for host every 500ms)
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
                        return;
                    }
                    devWarn('[Page MCP Content] Bridge ready signal not observed; native widget detected, attempt connect once');
                }
                try {
                    const nativeState = await loadNativeMcpState(client);
                    console.log('[Page MCP Content] Client connected, host:', nativeState.hostInfo);
                    setMcpClient(client);
                    const nativeTools = nativeState.tools;
                    const nativePrompts = nativeState.prompts;
                    const nativeResources = nativeState.resources;
                    console.log('[Page MCP Content] Tools:', nativeTools.length, 'Prompts:', nativePrompts.length);
                    console.log('[Page MCP Content] Resources:', nativeResources.length);

                    const host = nativeState.hostInfo;
                    nativeBaseRef.current = {
                        tools: nativeTools as Array<WithSource<ToolInfo>>,
                        prompts: nativePrompts as Array<WithSource<PromptInfo>>,
                        resources: nativeResources,
                        hostInfo: host,
                    };
                    applyCapabilities({
                        tools: nativeTools as Array<WithSource<ToolInfo>>,
                        prompts: nativePrompts as Array<WithSource<PromptInfo>>,
                        resources: nativeResources as Array<WithSource<ResourceInfo>>,
                    }, host);
                } catch (e) {
                    devWarn('[Page MCP Content] Client connect failed:', e);
                    setMcpClient(null);
                    nativeBaseRef.current = {
                        tools: [],
                        prompts: [],
                        resources: [],
                        hostInfo: { name: 'remote-only', version: '1.0.0' },
                    };
                    applyCapabilities({ tools: [], prompts: [], resources: [] }, { name: 'remote-only', version: '1.0.0' });
                }
            }
        };

        init();

        const observer = new MutationObserver(() => {
            const native = !!document.getElementById('page-mcp-chat-widget');
            setHasNativeChat(native);
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

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

        const onSettingsMsg = (msg: any, _sender: any, sendResponse: (response?: any) => void) => {
            if (msg.type === 'SETTINGS_CHANGED') {
                setSettings(msg.settings);
                settingsRef.current = msg.settings;
                refreshByPathRef.current?.().catch(() => { });
            }
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
                        skills: [],
                    }
                });
                return true;
            }
        };
        chrome.runtime.onMessage.addListener(onSettingsMsg);

        return () => {
            observer.disconnect();
            chrome.runtime.onMessage.removeListener(onSettingsMsg);
            window.removeEventListener('pmcp:pathchange', onPathChange);
            window.removeEventListener('popstate', onPathChange);
            window.removeEventListener('hashchange', onPathChange);
            document.removeEventListener('turbo:load', maybeEmitPathChange as EventListener);
            document.removeEventListener('pjax:end', maybeEmitPathChange as EventListener);
            window.clearInterval(pathWatchTimer);
        };
    }, []);

    // Visibility computation
    useEffect(() => {
        const isDomainOverridden = settings.overridePageChat && settings.overrideSites.some(site => {
            if (site.startsWith('*.')) { const base = site.slice(2); return currentDomain === base || currentDomain.endsWith('.' + base); }
            return currentDomain === site;
        });

        if (hasNativeChat && !isDomainOverridden) {
            setWidgetVisible(false);
            return;
        }

        if (settings.alwaysInjectChat) {
            setWidgetVisible(true);
            return;
        }

        const hasResources = tools.length > 0 || prompts.length > 0 || resources.length > 0;
        if (settings.injectChatOnResources && hasResources) {
            setWidgetVisible(true);
            return;
        }

        setWidgetVisible(false);
    }, [settings, hasNativeChat, tools, prompts, resources]);

    // Handle Native chat hidding
    useEffect(() => {
        const nativeEl = document.getElementById('page-mcp-chat-widget');
        const isDomainOverridden = settings.overridePageChat && settings.overrideSites.some(site => {
            if (site.startsWith('*.')) return currentDomain.endsWith(site.slice(1)) || currentDomain === site.slice(2);
            return currentDomain === site;
        });

        if (nativeEl) {
            nativeEl.style.display = (isDomainOverridden) ? 'none' : '';
        }
    }, [hasNativeChat, settings.overridePageChat, settings.overrideSites]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => { scrollToBottom(); }, [activeConv?.messages, isLoading]);

    useEffect(() => {
        setAttachedResourceUris((current) => getInitialAttachedResourceUris(resources, current));
    }, [resources]);

        const persistConv = async (conv: Conversation) => {
        conv.updatedAt = Date.now();
        if (conv.title === 'New Chat' || conv.title === t('newChatTitle')) {
            const first = conv.messages.find(m => m.role === 'user');
            if (first) {
                conv.title = first.content.slice(0, 40) + (first.content.length > 40 ? '...' : '');
            }
        }

        let newConvs = [...conversations];
        const idx = newConvs.findIndex(c => c.id === conv.id);
        if (idx >= 0) newConvs[idx] = conv;
        else newConvs.unshift(conv);

        setConversations(newConvs);
        await safeRuntimeMessage('SAVE_CONVERSATION', { type: 'SAVE_CONVERSATION', conversation: conv });
    };

    const startNewChat = () => {
        const newId = `conv_${Date.now()}`;
        const newConv: Conversation = { id: newId, title: t('newChatTitle', undefined) || 'New Chat', domain: currentDomain, createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
        setConversations(prev => [newConv, ...prev]);
        setActiveConvId(newId);
    };

    const deleteConv = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = conversations.filter(c => c.id !== id);
        setConversations(updated);
        await safeRuntimeMessage('DELETE_CONVERSATION', { type: 'DELETE_CONVERSATION', conversationId: id });
        if (activeConvId === id) setActiveConvId(null);
    };

    const formatMessageTime = (timestamp: number): string => {
        const d = new Date(timestamp);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    const streamCompletion = async (
        messages: OpenAIChatMessage[],
        onDelta: (delta: string) => void
    ): Promise<void> => {
        await new Promise<void>((resolve, reject) => {
            const port = chrome.runtime.connect({ name: 'PMCP_AI_STREAM' });
            const onMessage = (msg: StreamPortMessage) => {
                if (!msg || typeof msg !== 'object') return;
                if (msg.type === 'CHUNK') {
                    if (typeof msg.delta === 'string' && msg.delta.length > 0) {
                        onDelta(msg.delta);
                    }
                    return;
                }
                port.onMessage.removeListener(onMessage as any);
                port.disconnect();
                if (msg.type === 'DONE') {
                    resolve();
                    return;
                }
                reject(new Error((msg as any).error || 'Stream failed'));
            };
            port.onMessage.addListener(onMessage as any);
            port.postMessage({
                type: 'START_STREAM',
                endpoint: '/chat/completions',
                payload: {
                    model: settings.model,
                    messages,
                    stream: true,
                },
            });
        });
    };

    const upsertConversation = (conv: Conversation) => {
        setConversations(prev => {
            const copy = [...prev];
            const idx = copy.findIndex(c => c.id === conv.id);
            if (idx >= 0) copy[idx] = conv;
            else copy.unshift(conv);
            return copy;
        });
    };

    const chatRuntime = createMcpChatRuntime({
        model: settings.model,
        mcpClient,
        tools: tools as any,
        prompts: prompts as any,
        resources: resources as any,
        buildExecutionCatalog,
        buildOpenAiToolsFromCatalog,
        toOpenAiMessages: (messages) => toOpenAiConversationMessages(messages) as OpenAIChatMessage[],
        formatToolResult,
        safeRuntimeMessage,
        streamCompletion,
        runConversationTurn: runMcpConversationTurn,
    });

    const handleSend = async (text: string = inputText) => {
        if (!text.trim() || isLoading) return;
        setInputText('');

        await runChatAction({
            activeConversation: activeConv ?? null,
            createConversation: () => ({
                id: `conv_${Date.now()}`,
                title: t('newChatTitle', undefined) || 'New Chat',
                domain: currentDomain,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                messages: [],
            }),
            prepareMessages: async () => {
                const userMessage: ChatMessage = { id: `msg_${Date.now()}`, role: 'user', content: text, timestamp: Date.now() };
                const resourceMessages = mcpClient
                    ? await buildAttachedResourceMessages({
                        selectedUris: attachedResourceUris,
                        resources,
                        readResource: (uri) => mcpClient.readResource(uri),
                    })
                    : [];
                return [userMessage, ...resourceMessages];
            },
            upsertConversation,
            setActiveConversationId: setActiveConvId,
            setLoading: setIsLoading,
            runPreparedTurn: async (conversation) => {
                const messages = await chatRuntime.runPreparedTurn({
                    conversationMessages: conversation.messages,
                    baseConversation: conversation,
                    updateConversation: (messages) => {
                        upsertConversation({ ...conversation, messages });
                    },
                    persistConversation: persistConv,
                });
                return { ...conversation, messages };
            },
            persistConversation: persistConv,
        });
    };

    const handlePromptShortcut = async (promptName: string) => {
        if (isLoading || !mcpClient) return;

        await runChatAction({
            activeConversation: activeConv ?? null,
            createConversation: () => ({
                id: `conv_${Date.now()}`,
                title: t('newChatTitle', undefined) || 'New Chat',
                domain: currentDomain,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                messages: [],
            }),
            prepareMessages: async () => {
                const resourceMessages = await buildAttachedResourceMessages({
                    selectedUris: attachedResourceUris,
                    resources,
                    readResource: (uri) => mcpClient.readResource(uri),
                });
                const promptMessages = await applyPromptShortcutMessages({
                    name: promptName,
                    getPrompt: (name, args) => mcpClient.getPrompt(name, args),
                });
                return [...resourceMessages, ...promptMessages];
            },
            upsertConversation,
            setActiveConversationId: setActiveConvId,
            setLoading: setIsLoading,
            runPreparedTurn: async (conversation) => {
                const messages = await chatRuntime.runPreparedTurn({
                    conversationMessages: conversation.messages,
                    baseConversation: conversation,
                    updateConversation: (messages) => {
                        upsertConversation({ ...conversation, messages });
                    },
                    persistConversation: persistConv,
                });
                return { ...conversation, messages };
            },
            persistConversation: persistConv,
        });
    };

    const totalCapabilities = tools.length + prompts.length + resources.length;
    const selectedResourceCountLabel = getSelectedResourceCountLabel(attachedResourceUris);
    const quickSuggestionItems = buildQuickActionCandidates({
        prompts: prompts as any[],
        tools: tools as any[],
        resources: resources as any[],
    }).map((item) => ({
        key: item.key,
        label: item.label,
        icon: item.icon,
        action: () => {
            handlePromptShortcut(item.name);
        },
    }));

    if (!widgetVisible) return null;

    return (
        <div id="page-mcp-plugin-react" className={`${settings.theme === 'dark' ? 'dark' : ''} ${settings.theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : '') : ''}`}>
            {/* FAB */}
            <button
                className={`pmcp-fab ${settings.position} ${panelOpen ? 'panel-open active' : ''} ${quickActionsOpen ? 'active' : ''}`}
                onMouseEnter={() => {
                    if (!panelOpen) {
                        setHoverTimeout(setTimeout(() => setQuickActionsOpen(true), 200));
                    }
                }}
                onMouseLeave={() => {
                    if (hoverTimeout) clearTimeout(hoverTimeout);
                    setTimeout(() => { if (!qaHovered.current) setQuickActionsOpen(false); }, 300);
                }}
                onClick={() => {
                    setQuickActionsOpen(false);
                    if (panelOpen) {
                        setPanelOpen(false);
                        setSidebarOpen(false);
                    } else {
                        if (!activeConvId && conversations.length > 0) setActiveConvId(conversations[0].id);
                        if (!activeConvId && conversations.length === 0) startNewChat();
                        setPanelOpen(true);
                    }
                }}
            >
                <div className="pmcp-fab-icon"><MessageSquare size={24} /></div>
                {totalCapabilities > 0 && <span className="pmcp-fab-badge">{totalCapabilities}</span>}
            </button>

            {/* Quick Actions overlay */}
            <div
                className={`pmcp-quick-actions ${settings.position} ${quickActionsOpen ? 'open' : ''}`}
                onMouseEnter={() => qaHovered.current = true}
                onMouseLeave={() => { qaHovered.current = false; setTimeout(() => { if (!qaHovered.current) setQuickActionsOpen(false); }, 300); }}
            >
                <div className="pmcp-qa-column">
                    {quickSuggestionItems.map(item => (
                        <button key={item.key} className="pmcp-qa-item pmcp-qa-prompt" onClick={() => { setQuickActionsOpen(false); setPanelOpen(true); item.action(); }}>
                            <span className="pmcp-qa-item-icon">{item.icon}</span>
                            <span className="pmcp-qa-item-label">{item.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div
                className={`pmcp-quick-actions-alt ${settings.position} ${quickActionsOpen ? 'open' : ''}`}
                onMouseEnter={() => qaHovered.current = true}
                onMouseLeave={() => { qaHovered.current = false; setTimeout(() => { if (!qaHovered.current) setQuickActionsOpen(false); }, 300); }}
            >
                <div className="pmcp-qa-column">
                    <button className="pmcp-qa-item pmcp-qa-circle pmcp-qa-action" onClick={() => { setQuickActionsOpen(false); safeRuntimeMessage('OPEN_OPTIONS', { type: 'OPEN_OPTIONS' }); }}>
                        <span className="pmcp-qa-item-icon"><SettingsIcon size={20} /></span>
                    </button>
                </div>
            </div>

            {/* Chat Panel */}
            <div
                className={`pmcp-panel ${settings.position} ${panelOpen ? 'open' : ''}`}
            >
                <div className="pmcp-panel-header">
                    <div className="pmcp-header-left">
                        <button className="pmcp-btn-icon pmcp-btn-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)} title="Chat History"><Clock size={18} /></button>
                        <span className="pmcp-header-dot"></span>
                        <span className="pmcp-header-title">{activeConv?.title || 'New Chat'}</span>
                    </div>
                    <div className="pmcp-header-actions">
                        <button className="pmcp-btn-icon pmcp-btn-new" onClick={startNewChat} title="New Chat"><Plus size={18} /></button>
                        <button className="pmcp-btn-icon pmcp-btn-close" onClick={() => setPanelOpen(false)} title="Close"><X size={18} /></button>
                    </div>
                </div>

                <div className="pmcp-panel-body">
                    {/* Sidebar */}
                    <div className={`pmcp-sidebar ${sidebarOpen ? 'open' : ''}`}>
                        <div className="pmcp-sidebar-header">
                            <span>Chat History</span>
                            <button className="pmcp-btn-icon pmcp-btn-sidebar-close" onClick={() => setSidebarOpen(false)}><X size={16} /></button>
                        </div>
                        <div className="pmcp-sidebar-list">
                            {conversations.length === 0 ? <div className="pmcp-sidebar-empty">No conversations yet</div> :
                                conversations.map(c => (
                                    <div key={c.id} className={`pmcp-sidebar-item ${c.id === activeConvId ? 'active' : ''}`} onClick={() => { setActiveConvId(c.id); setSidebarOpen(false); }}>
                                        <div className="pmcp-sidebar-item-content">
                                            <div className="pmcp-sidebar-item-title">{c.title}</div>
                                            <div className="pmcp-sidebar-item-date">{new Date(c.updatedAt).toLocaleDateString()}</div>
                                        </div>
                                        <button className="pmcp-btn-icon pmcp-sidebar-item-delete" onClick={(e) => deleteConv(c.id, e)}><Trash2 size={16} /></button>
                                    </div>
                                ))
                            }
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className="pmcp-chat-area">
                        <div className="pmcp-messages">
                            {(!activeConv || activeConv.messages.length === 0) && (
                                <div className="pmcp-welcome">
                                    <div className="pmcp-welcome-icon"><MessageSquare size={32} /></div>
                                    <div className="pmcp-welcome-title">AI Assistant</div>
                                    <div className="pmcp-welcome-sub">{totalCapabilities > 0 ? `Connected · ${totalCapabilities} capabilities available` : 'Start a conversation'}</div>
                                    <div className="pmcp-welcome-prompts">
                                        {quickSuggestionItems.slice(0, MAX_QUICK_PROMPTS).map(item => (
                                            <button key={item.key} className="pmcp-welcome-prompt-btn" onClick={item.action}>
                                                <span className="pmcp-wp-icon">{item.icon}</span>
                                                <span className="pmcp-wp-title">{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {filterRenderableMessages(activeConv?.messages ?? []).map((m, i) => {
                                if (m.role === 'tool' && m.toolCalls?.[0]) {
                                    const call = m.toolCalls[0];
                                    const messageId = m.id || String(i);
                                    const expanded = !!expandedToolDetails[messageId];
                                    return (
                                        <div key={messageId} className="pmcp-tool-card">
                                            <div className="pmcp-tool-header">
                                                <span className="pmcp-tool-name">{call.name}</span>
                                                <div className="pmcp-tool-header-right">
                                                    <span className={`pmcp-tool-status ${call.status}`}>{call.status}</span>
                                                    <button
                                                        className="pmcp-tool-toggle-icon"
                                                        type="button"
                                                        onClick={() => setExpandedToolDetails((prev) => ({ ...prev, [messageId]: !expanded }))}
                                                        aria-label={expanded ? 'collapse-json' : 'expand-json'}
                                                    >
                                                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    </button>
                                                </div>
                                            </div>
                                            {expanded && (
                                                <>
                                                    <div className="pmcp-tool-result">
                                                        <span className="pmcp-tool-result-label">args:</span>
                                                        <pre>{formatToolResult(call.args)}</pre>
                                                    </div>
                                                    <div className="pmcp-tool-result">
                                                        <span className="pmcp-tool-result-label">result:</span>
                                                        <pre>{formatToolResult(getToolCallResultPayload(call))}</pre>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                }

                                const roleClass = m.role === 'user' ? 'pmcp-msg-user' : 'pmcp-msg-assistant';
                                const roleLabel = m.role === 'user' ? 'You' : 'Assistant';
                                const roleAvatar = m.role === 'user' ? 'Y' : 'AI';

                                return (
                                    <div key={m.id || i} className={`pmcp-msg ${roleClass}`}>
                                        <div className="pmcp-msg-row">
                                            <div className="pmcp-msg-main">
                                                    <div className="pmcp-msg-label-row">
                                                        <div className="pmcp-msg-label">{roleLabel}</div>
                                                        <div className="pmcp-msg-time">{formatMessageTime(m.timestamp)}</div>
                                                    </div>
                                                    <div className="pmcp-bubble pmcp-message-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}></div>
                                                </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {isLoading && (
                                <div className="pmcp-loading">
                                    <div className="pmcp-loading-dot"></div><div className="pmcp-loading-dot"></div><div className="pmcp-loading-dot"></div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {resources.length > 0 && (
                            <div className={`pmcp-resource-panel ${resourcePanelOpen ? 'open' : ''}`}>
                                {resources.map((resource) => {
                                    const checked = attachedResourceUris.includes(resource.uri);
                                    return (
                                        <label key={resource.uri} className="pmcp-resource-option">
                                            <input
                                                className="pmcp-resource-checkbox"
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => setAttachedResourceUris((current) => toggleAttachedResourceUri(current, resource.uri))}
                                            />
                                            <span className="pmcp-resource-meta">
                                                <span className="pmcp-resource-name">{resource.name}</span>
                                                <span className="pmcp-resource-uri">{resource.uri}</span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}

                        <div className="pmcp-input-area">
                            {resources.length > 0 && (
                                <button
                                    className="pmcp-resource-toggle-btn"
                                    type="button"
                                    onClick={() => setResourcePanelOpen((open) => !open)}
                                    aria-label={selectedResourceCountLabel ? `Attach resources (${selectedResourceCountLabel} selected)` : 'Attach resources'}
                                    title={selectedResourceCountLabel ? `Attach resources (${selectedResourceCountLabel} selected)` : 'Attach resources'}
                                >
                                    <Layers3 size={18} />
                                    {selectedResourceCountLabel && (
                                        <span className="pmcp-resource-count">{selectedResourceCountLabel}</span>
                                    )}
                                </button>
                            )}
                            <input
                                className="pmcp-input"
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                    stopPageShortcutPropagation(e);
                                }}
                                onKeyUp={stopPageShortcutPropagation}
                                placeholder="Type a message..."
                                disabled={isLoading}
                            />
                            <button className="pmcp-btn-send" onClick={() => handleSend()} disabled={!inputText.trim() || isLoading}><Send size={18} /></button>
                        </div>
                    </div>
                </div>
            </div>
            <style>{generatePluginStyles(settings.theme, settings.accentColor)}</style>
        </div>
    );
};

// Mount root
const containerId = 'page-mcp-plugin-host';
let hostWrapper = document.getElementById(containerId);
if (!hostWrapper) {
    hostWrapper = document.createElement('div');
    hostWrapper.id = containerId;
    document.body.appendChild(hostWrapper);
    const shadow = hostWrapper.attachShadow({ mode: 'open' });
    const rootEl = document.createElement('div');
    shadow.appendChild(rootEl);

    // Inject the bundled index.css from tailwind (wait, content JS does not use Tailwind currently, it uses styles.ts)
    const root = createRoot(rootEl);
    root.render(<ChatWidget />);
}

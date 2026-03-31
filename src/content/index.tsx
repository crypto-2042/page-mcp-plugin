import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type {
    AnthropicMcpPrompt as PromptInfo,
    AnthropicMcpResource as ResourceInfo,
    AnthropicMcpTool as ToolInfo,
} from '@page-mcp/protocol';
import { MAX_QUICK_PROMPTS } from '../shared/constants.js';
import { generateConversationId, generateMessageId } from '../shared/id.js';
import type { ChatMessage, Conversation, ConversationQuote } from '../shared/types.js';
import { generatePluginStyles } from './styles.js';
import { renderMarkdown } from './markdown.js';
import { formatToolResult } from './tool-result-format.js';
import { buildQuickActionCandidates } from './quick-actions.js';
import { buildExecutionCatalog, type ExecutableTool } from './execution-catalog.js';
import { buildAttachedResourceMessages, readLocalResource } from './mcp-resources.js';
import { applyPromptShortcutMessages } from './mcp-prompt-shortcuts.js';
import {
    getInitialAttachedResourceUris,
    getSelectedResourceCountLabel,
    toggleAttachedResourceUri,
} from './mcp-resource-selection.js';
import {
    buildOpenAiToolsFromCatalog,
    toOpenAiConversationMessages,
    type OpenAiToolDefinition,
    type OpenAIChatMessage,
    type OpenAIStreamEvent,
} from './mcp-openai.js';
import { filterRenderableMessages } from './chat-message-visibility.js';
import { getToolCallResultPayload } from './tool-call-display.js';
import { createMcpChatRuntime } from './mcp-chat-runtime.js';
import { runChatAction } from './mcp-chat-actions.js';
import { safeRuntimeMessage } from './safe-runtime.js';
import { buildStreamRequestPayload } from './chat-stream.js';
import {
    SelectionQuoteArea,
    clearSelectionQuoteConversation,
    getSelectionQuoteDisplayState,
    pinSelectionQuoteConversation,
} from './selection-quote-ui.js';
import { registerSelectionQuoteRuntimeListener } from './selection-quote-runtime.js';
import { buildSelectionQuotePreparedMessages } from './selection-quote-send.js';

// Hooks
import { usePluginSettings } from './hooks/use-settings.js';
import { useMcpDiscovery } from './hooks/use-mcp-discovery.js';
import { useConversationManager } from './hooks/use-conversations.js';
import { useWidgetVisibility } from './hooks/use-widget-visibility.js';

// Icons
import { MessageSquare, X, Send, Clock, Plus, Settings as SettingsIcon, Trash2, ChevronDown, ChevronUp, Layers3, Square } from 'lucide-react';

const currentDomain = window.location.hostname;

type WithSource<T> = T & {
    sourceType: 'native' | 'remote';
    sourceLabel: string;
    sourceRepositoryId?: string;
};

type PendingToolConfirm = {
    toolName: string;
    sourceLabel: string;
    args: Record<string, unknown>;
    resolve: (allowed: boolean) => void;
};

/** Build inline ChatMessages from a stored prompt's messages array (remote prompts). */
function buildInlinePromptMessages(
    messages: Array<Record<string, unknown>> | undefined
): ChatMessage[] {
    if (!Array.isArray(messages) || messages.length === 0) return [];
    const timestamp = Date.now();
    return messages
        .filter((m: any) => {
            const content = m?.content;
            if (typeof content === 'string') return content.length > 0;
            if (content && typeof content === 'object') {
                return content.type === 'text' && typeof content.text === 'string' && content.text.length > 0;
            }
            return false;
        })
        .map((m: any, index: number) => {
            const content = m.content;
            const text = typeof content === 'string' ? content : (content as any).text as string;
            return {
                id: `msg_inline_${timestamp}_${index}`,
                role: (m.role || 'user') as 'user' | 'assistant' | 'system',
                content: text,
                timestamp: timestamp + index,
            };
        });
}

type StreamPortMessage =
    | { type: 'CHUNK'; delta: string }
    | { type: 'TOOL_CALL_CHUNK'; toolCalls: Array<{ index: number; id?: string; type?: 'function'; function?: { name?: string; arguments?: string } }> }
    | { type: 'DONE' }
    | { type: 'ERROR'; error: string };

// ============================================================
// ChatWidget Component
// ============================================================

const ChatWidget = () => {
    // --- Hooks ---
    const { settings, isLoaded, t } = usePluginSettings();
    const { mcpClient, tools, prompts, resources, hasNativeChat, installedReposRef } = useMcpDiscovery(settings, isLoaded);
    const {
        conversations, activeConvId, activeConv, setActiveConvId,
        startNewChat, deleteConv, persistConv, upsertConversation, createConversation,
    } = useConversationManager(currentDomain, t);
    const widgetVisible = useWidgetVisibility(settings, hasNativeChat, tools, prompts, resources);

    // --- UI State ---
    const [panelOpen, setPanelOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [quickActionsOpen, setQuickActionsOpen] = useState(false);
    const [resourcePanelOpen, setResourcePanelOpen] = useState(false);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [draftQuote, setDraftQuote] = useState<ConversationQuote | null>(null);
    const [attachedResourceUris, setAttachedResourceUris] = useState<string[]>([]);
    const [expandedToolDetails, setExpandedToolDetails] = useState<Record<string, boolean>>({});

    // Use useRef for hover timeout to avoid unnecessary re-renders (P2 #15)
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const qaHovered = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [pendingToolConfirm, setPendingToolConfirm] = useState<PendingToolConfirm | null>(null);

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

    // --- Derived ---
    const stopPageShortcutPropagation = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        const native = e.nativeEvent as KeyboardEvent;
        if (typeof native.stopImmediatePropagation === 'function') {
            native.stopImmediatePropagation();
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => { scrollToBottom(); }, [activeConv?.messages, isLoading]);

    useEffect(() => {
        setAttachedResourceUris((current) => getInitialAttachedResourceUris(resources, current));
    }, [resources]);

    useEffect(() => {
        return registerSelectionQuoteRuntimeListener({
            onQuote: setDraftQuote,
            onOpenPanel: () => setPanelOpen(true),
        });
    }, []);

    const formatMessageTime = (timestamp: number): string => {
        const d = new Date(timestamp);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    // --- Stream Completion ---
    const streamCompletion = async (
        messages: OpenAIChatMessage[],
        onEvent: (event: OpenAIStreamEvent) => void,
        streamTools?: OpenAiToolDefinition[],
        signal?: AbortSignal,
    ): Promise<void> => {
        await new Promise<void>((resolve, reject) => {
            const port = chrome.runtime.connect({ name: 'PMCP_AI_STREAM' });
            
            const cleanup = () => {
                port.onMessage.removeListener(onMessage as Parameters<typeof port.onMessage.addListener>[0]);
                if (signal) signal.removeEventListener('abort', onAbort);
            };

            const onAbort = () => {
                cleanup();
                port.disconnect();
                reject(new DOMException('Aborted', 'AbortError'));
            };

            if (signal?.aborted) return onAbort();
            if (signal) signal.addEventListener('abort', onAbort);

            const onMessage = (msg: StreamPortMessage) => {
                if (!msg || typeof msg !== 'object') return;
                if (msg.type === 'CHUNK') {
                    if (typeof msg.delta === 'string' && msg.delta.length > 0) {
                        onEvent({ type: 'text-delta', delta: msg.delta });
                    }
                    return;
                }
                if (msg.type === 'TOOL_CALL_CHUNK') {
                    if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
                        onEvent({ type: 'tool-call-delta', toolCalls: msg.toolCalls });
                    }
                    return;
                }
                cleanup();
                port.disconnect();
                if (msg.type === 'DONE') {
                    resolve();
                    return;
                }
                reject(new Error((msg as { error?: string }).error || 'Stream failed'));
            };
            port.onMessage.addListener(onMessage as Parameters<typeof port.onMessage.addListener>[0]);
            port.postMessage({
                type: 'START_STREAM',
                endpoint: '/chat/completions',
                payload: buildStreamRequestPayload({
                    model: settings.model,
                    messages,
                    tools: streamTools,
                }),
            });
        });
    };

    const getRepoAllowWithoutConfirm = (repoId?: string): boolean => {
        if (!repoId) return false;
        const repo = installedReposRef.current.find((item) => item.repositoryId === repoId);
        return !!repo?.allowWithoutConfirm;
    };

    const confirmRemoteTool = async (tool: ExecutableTool, args: Record<string, unknown>): Promise<boolean> => {
        if (tool.sourceType !== 'remote') return true;
        if (getRepoAllowWithoutConfirm(tool.sourceRepositoryId)) return true;
        if (!panelOpen) setPanelOpen(true);
        return new Promise((resolve) => {
            setPendingToolConfirm({
                toolName: tool.displayName,
                sourceLabel: tool.sourceLabel || 'remote',
                args,
                resolve,
            });
        });
    };

    const resolveToolConfirm = (allowed: boolean) => {
        const pending = pendingToolConfirm;
        if (!pending) return;
        pending.resolve(allowed);
        setPendingToolConfirm(null);
    };

    const handlePinSelectionQuote = async () => {
        if (!draftQuote) return;

        const baseConversation = activeConv ?? createConversation();
        if (!activeConv) {
            setActiveConvId(baseConversation.id);
        }

        const nextConversation = pinSelectionQuoteConversation({
            conversation: baseConversation,
            quote: draftQuote,
        });

        await persistConv(nextConversation);
        setDraftQuote(null);
    };

    const handleCloseSelectionQuote = async () => {
        if (draftQuote) {
            setDraftQuote(null);
            return;
        }

        if (!activeConv?.pinnedQuote) return;

        const nextConversation = clearSelectionQuoteConversation(activeConv);
        await persistConv(nextConversation);
        upsertConversation(nextConversation);
    };

    const selectionQuoteDisplay = getSelectionQuoteDisplayState({
        draftQuote,
        activeConversation: activeConv,
    });



    // --- Chat Runtime ---
    const chatRuntime = createMcpChatRuntime({
        model: settings.model,
        mcpClient,
        tools: tools as Array<WithSource<ToolInfo>>,
        buildExecutionCatalog,
        buildOpenAiToolsFromCatalog,
        toOpenAiMessages: (msgs) => toOpenAiConversationMessages(msgs) as OpenAIChatMessage[],
        formatToolResult,
        safeRuntimeMessage,
        streamCompletion,
        confirmRemoteTool,
    });

    const handleReadResource = async (uri: string) => {
        if (uri.startsWith('page://')) {
            return readLocalResource(uri);
        }
        if (mcpClient) {
            return mcpClient.readResource(uri);
        }
        throw new Error(`Cannot read resource without a native MCP client: ${uri}`);
    };

    const runSelectionQuotePreparedTurn = async (params: {
        buildBaseMessages: () => Promise<ChatMessage[]>;
    }) => {
        const selectionQuoteState = {
            draftQuote,
            pinnedQuote: activeConv?.pinnedQuote ?? null,
        };
        let shouldClearDraftQuoteAfterCommit = false;

        await runChatAction({
            activeConversation: activeConv,
            createConversation,
            prepareMessages: async () => {
                const baseMessages = await params.buildBaseMessages();
                const prepared = buildSelectionQuotePreparedMessages({
                    draftQuote: selectionQuoteState.draftQuote,
                    pinnedQuote: selectionQuoteState.pinnedQuote,
                    baseMessages,
                });
                shouldClearDraftQuoteAfterCommit = prepared.shouldClearDraftQuoteAfterCommit;
                return prepared.messages;
            },
            upsertConversation: (conversation) => {
                upsertConversation(conversation);
                if (shouldClearDraftQuoteAfterCommit) {
                    shouldClearDraftQuoteAfterCommit = false;
                    setDraftQuote(null);
                }
            },
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
                    signal: abortControllerRef.current?.signal,
                });
                return { ...conversation, messages };
            },
            persistConversation: persistConv,
        });
    };

    const handleSend = async (text: string = inputText) => {
        if (!text.trim() || isLoading) return;
        setInputText('');
        
        abortControllerRef.current = new AbortController();

        await runSelectionQuotePreparedTurn({
            buildBaseMessages: async () => {
                const userMessage: ChatMessage = { id: generateMessageId(), role: 'user', content: text, timestamp: Date.now() };
                const resourceMessages = await buildAttachedResourceMessages({
                    selectedUris: attachedResourceUris,
                    resources,
                    readResource: handleReadResource,
                });
                return [...resourceMessages, userMessage];
            },
        });
        abortControllerRef.current = null;
    };

    const promptsRef = useRef<WithSource<PromptInfo>[]>([]);
    promptsRef.current = prompts as WithSource<PromptInfo>[];

    const handlePromptShortcut = async (promptName: string) => {
        if (isLoading) return;

        // Find the prompt in the current list to detect inline messages (remote prompts)
        const foundPrompt = promptsRef.current.find((p) => p.name === promptName) as any;
        const inlineMessages: Array<Record<string, unknown>> | undefined =
            foundPrompt?.messages;

        // Remote prompts have inline messages — use them directly (no mcpClient needed)
        if (inlineMessages && inlineMessages.length > 0) {
            const builtMessages = buildInlinePromptMessages(inlineMessages);
            if (builtMessages.length === 0) return;
            
            abortControllerRef.current = new AbortController();

            await runSelectionQuotePreparedTurn({
                buildBaseMessages: async () => {
                    const resourceMessages = await buildAttachedResourceMessages({
                        selectedUris: attachedResourceUris,
                        resources,
                        readResource: handleReadResource,
                    });
                    return [...resourceMessages, ...builtMessages];
                },
            });
            abortControllerRef.current = null;
            return;
        }

        // Native prompts — use mcpClient.getPrompt()
        if (!mcpClient) return;
        
        abortControllerRef.current = new AbortController();

        await runSelectionQuotePreparedTurn({
            buildBaseMessages: async () => {
                const resourceMessages = await buildAttachedResourceMessages({
                    selectedUris: attachedResourceUris,
                    resources,
                    readResource: handleReadResource,
                });
                const promptMessages = await applyPromptShortcutMessages({
                    name: promptName,
                    getPrompt: (name, args) => mcpClient.getPrompt(name, args),
                });
                return [...resourceMessages, ...promptMessages];
            },
        });
        abortControllerRef.current = null;
    };

    // --- Quick Actions ---
    const totalCapabilities = tools.length + prompts.length + resources.length;
    const selectedResourceCountLabel = getSelectedResourceCountLabel(attachedResourceUris);
    const quickSuggestionItems = buildQuickActionCandidates({
        prompts: prompts as PromptInfo[],
        tools: tools as ToolInfo[],
        resources: resources as ResourceInfo[],
    }).map((item) => ({
        key: item.key,
        label: item.label,
        icon: item.icon,
        action: () => { handlePromptShortcut(item.name); },
    }));

    if (!widgetVisible) return null;

    // --- Render ---
    return (
        <div id="page-mcp-plugin-react" className={`${settings.theme === 'dark' ? 'dark' : ''} ${settings.theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : '') : ''}`}>
            {/* FAB */}
            <button
                className={`pmcp-fab ${settings.position} ${panelOpen ? 'panel-open active' : ''} ${quickActionsOpen ? 'active' : ''}`}
                onMouseEnter={() => {
                    if (!panelOpen) {
                        hoverTimeoutRef.current = setTimeout(() => setQuickActionsOpen(true), 200);
                    }
                }}
                onMouseLeave={() => {
                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
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
            <div className={`pmcp-panel ${settings.position} ${panelOpen ? 'open' : ''}`}>
                <div className="pmcp-panel-header">
                    <div className="pmcp-header-left">
                        <button className="pmcp-btn-icon pmcp-btn-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)} title={t('chatHistory')}><Clock size={18} /></button>
                        <span className="pmcp-header-dot"></span>
                        <span className="pmcp-header-title">{activeConv?.title || t('newChatTitle') || 'New Chat'}</span>
                    </div>
                    <div className="pmcp-header-actions">
                        <button className="pmcp-btn-icon pmcp-btn-new" onClick={startNewChat} title={t('newChatTitle')}><Plus size={18} /></button>
                        <button className="pmcp-btn-icon pmcp-btn-close" onClick={() => setPanelOpen(false)} title={t('close')}><X size={18} /></button>
                    </div>
                </div>

                <div className="pmcp-panel-body">
                    {/* Sidebar */}
                    <div className={`pmcp-sidebar ${sidebarOpen ? 'open' : ''}`}>
                        <div className="pmcp-sidebar-header">
                            <span>{t('chatHistory') || 'Chat History'}</span>
                            <button className="pmcp-btn-icon pmcp-btn-sidebar-close" onClick={() => setSidebarOpen(false)}><X size={16} /></button>
                        </div>
                        <div className="pmcp-sidebar-list">
                            {conversations.length === 0 ? <div className="pmcp-sidebar-empty">{t('noConversations') || 'No conversations yet'}</div> :
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
                                    <div className="pmcp-welcome-title">{t('aiAssistant') || 'AI Assistant'}</div>
                                    <div className="pmcp-welcome-sub">{totalCapabilities > 0 ? `${t('connected') || 'Connected'} · ${totalCapabilities} ${t('capabilitiesAvailable') || 'capabilities available'}` : t('startConversation') || 'Start a conversation'}</div>
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
                                const roleLabel = m.role === 'user' ? (t('you') || 'You') : (t('assistant') || 'Assistant');

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
                                                <span className="pmcp-resource-name">{resource.name || resource.uri}</span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}

                        <SelectionQuoteArea
                            open={panelOpen}
                            quote={selectionQuoteDisplay?.quote ?? null}
                            pinned={selectionQuoteDisplay?.pinned}
                            onClose={handleCloseSelectionQuote}
                            onPin={draftQuote ? handlePinSelectionQuote : undefined}
                        />

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
                                placeholder={t('typeMessage') || 'Type a message...'}
                                disabled={isLoading}
                            />
                            {isLoading ? (
                                <button className="pmcp-btn-send pmcp-btn-stop" onClick={handleStop} title={t('stop') || 'Stop generation'}><Square size={18} fill="currentColor" /></button>
                            ) : (
                                <button className="pmcp-btn-send" onClick={() => handleSend()} disabled={!inputText.trim()}><Send size={18} /></button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {pendingToolConfirm && (
                <div className="pmcp-confirm-backdrop" onClick={() => resolveToolConfirm(false)}>
                    <div className="pmcp-confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="pmcp-confirm-title">{t('confirmRemoteToolTitle') || '确认执行远程工具'}</div>
                        <div className="pmcp-confirm-meta">
                            <div><strong>{t('confirmRemoteToolName') || '工具'}:</strong> {pendingToolConfirm.toolName}</div>
                            <div><strong>{t('confirmRemoteToolSource') || '来源'}:</strong> {pendingToolConfirm.sourceLabel}</div>
                        </div>
                        {Object.keys(pendingToolConfirm.args).length > 0 && (
                            <div className="pmcp-confirm-args-form">
                                <div className="pmcp-confirm-args-label">{t('confirmRemoteToolArgs') || '参数'}</div>
                                {Object.entries(pendingToolConfirm.args).map(([key, value]) => {
                                    let displayValue = '';
                                    try {
                                        if (typeof value === 'object' && value !== null) {
                                            displayValue = JSON.stringify(value, null, 2);
                                        } else {
                                            displayValue = String(value);
                                        }
                                        if (displayValue.length > 2000) displayValue = `${displayValue.slice(0, 2000)}...`;
                                    } catch {
                                        displayValue = String(value);
                                    }
                                    const isMultiline = displayValue.includes('\n') || displayValue.length > 60;
                                    return (
                                        <div key={key} className="pmcp-confirm-arg-row">
                                            <label className="pmcp-confirm-arg-key" title={key}>{key}</label>
                                            {isMultiline ? (
                                                <textarea 
                                                    className="pmcp-confirm-arg-value pmcp-confirm-arg-textarea" 
                                                    value={displayValue} 
                                                    readOnly 
                                                    rows={Math.min(displayValue.split('\n').length, 10)}
                                                />
                                            ) : (
                                                <input 
                                                    className="pmcp-confirm-arg-value" 
                                                    value={displayValue} 
                                                    readOnly 
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <div className="pmcp-confirm-actions">
                            <button className="pmcp-btn-ghost" type="button" onClick={() => resolveToolConfirm(false)}>
                                {t('confirmRemoteToolCancel') || '取消'}
                            </button>
                            <button className="pmcp-btn-primary" type="button" onClick={() => resolveToolConfirm(true)}>
                                {t('confirmRemoteToolAllow') || '允许'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
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

    const root = createRoot(rootEl);
    root.render(<ChatWidget />);
}

// ============================================================
// Page MCP Plugin — Background Service Worker
// ============================================================

import { getSettings, saveSettings, getConversations, saveConversation, deleteConversation, getRemoteRepositories, getRemoteRepositoriesForHost, saveRemoteRepositories, getMcpSkillsRepositories, getMcpSkillsRepositoriesForHost, saveMcpSkillsRepositories } from '../shared/storage.js';
import type { PluginMessage } from '../shared/types.js';
import { buildRepoKey, upsertInstalledRepo } from '../shared/remote-repos.js';
import { validateExternalInstall } from './background-install.js';
import { deleteRemoteRepoById, toggleRemoteRepoEnabled } from './background-remote-repos.js';
import { deleteMcpSkillsRepoById, toggleMcpSkillsRepoEnabled, upsertMcpSkillsRepo } from './background-mcp-skills-repos.js';
import { buildProxyApiUrl } from './proxy-api.js';

const PROXY_TIMEOUT_MS = 30000;
const AI_STREAM_PORT = 'PMCP_AI_STREAM';

function normalizeApiKey(raw: string): string {
    const trimmed = (raw || '').trim();
    return trimmed.replace(/^Bearer\s+/i, '');
}

// ---- Message Handler ----

chrome.runtime.onMessage.addListener((message: PluginMessage, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch((error) => {
            sendResponse({ error: (error as Error)?.message || 'Internal error' });
        });
    return true; // keep channel open for async response
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    handleExternalInstall(message, sender)
        .then(sendResponse)
        .catch((error) => {
            sendResponse({ ok: false, error: (error as Error)?.message || 'Internal error' });
        });
    return true;
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== AI_STREAM_PORT) return;
    let activeController: AbortController | null = null;

    port.onDisconnect.addListener(() => {
        activeController?.abort();
    });

    port.onMessage.addListener(async (msg) => {
        if (!msg || msg.type !== 'START_STREAM') return;

        // Abort any previous in-flight request on this port
        activeController?.abort();
        const controller = new AbortController();
        activeController = controller;

        try {
            const settings = await getSettings();
            const apiKey = normalizeApiKey(settings.apiKey);
            if (!apiKey) {
                port.postMessage({ type: 'ERROR', error: 'Missing API key' });
                return;
            }

            const endpoint = typeof msg.endpoint === 'string' ? msg.endpoint : '/chat/completions';
            const payload = (msg.payload && typeof msg.payload === 'object') ? msg.payload : {};
            const url = buildProxyApiUrl(settings.baseURL, endpoint);
            const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'x-api-key': apiKey,
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            }).finally(() => clearTimeout(timeoutId));

            if (!response.ok) {
                const errBody = await response.text().catch(() => '');
                let message = `HTTP ${response.status}`;
                try {
                    const parsed = JSON.parse(errBody);
                    message = parsed?.error?.message || message;
                } catch { }
                port.postMessage({ type: 'ERROR', error: message });
                return;
            }

            if (!response.body) {
                port.postMessage({ type: 'ERROR', error: 'No response stream body' });
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    if (!line || !line.startsWith('data:')) continue;
                    const chunk = line.slice(5).trim();
                    if (!chunk) continue;
                    if (chunk === '[DONE]') {
                        port.postMessage({ type: 'DONE' });
                        return;
                    }
                    try {
                        const parsed = JSON.parse(chunk);
                        const delta = parsed?.choices?.[0]?.delta?.content;
                        if (typeof delta === 'string' && delta.length > 0) {
                            port.postMessage({ type: 'CHUNK', delta });
                        }
                    } catch {
                        // Ignore malformed partial chunks
                    }
                }
            }

            port.postMessage({ type: 'DONE' });
        } catch (error) {
            if ((error as Error)?.name === 'AbortError') {
                port.postMessage({ type: 'ERROR', error: `Request timeout after ${PROXY_TIMEOUT_MS}ms` });
                return;
            }
            port.postMessage({ type: 'ERROR', error: (error as Error)?.message || 'Stream request failed' });
        }
    });
});

async function handleMessage(msg: PluginMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
    switch (msg.type) {
        case 'GET_SETTINGS': {
            const settings = await getSettings();
            return { type: 'SETTINGS_RESULT', settings };
        }
        case 'SAVE_SETTINGS': {
            const settings = await saveSettings(msg.settings);
            // Broadcast SETTINGS_CHANGED to ALL tabs (including sender)
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'SETTINGS_CHANGED',
                        settings,
                    }).catch(() => { /* tab may not have content script */ });
                }
            }
            return { type: 'SETTINGS_RESULT', settings };
        }
        case 'PROXY_API_CALL': {
            const settings = await getSettings();
            const apiKey = normalizeApiKey(settings.apiKey);
            if (!apiKey) {
                return { error: 'Missing API key' };
            }

            try {
                const url = buildProxyApiUrl(settings.baseURL, msg.endpoint);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'x-api-key': apiKey,
                    },
                    body: JSON.stringify(msg.payload || {}),
                    signal: controller.signal,
                }).finally(() => clearTimeout(timeoutId));
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const message =
                        (data && typeof data === 'object' && (data as any).error?.message)
                        || `HTTP ${response.status}`;
                    return { error: message };
                }
                return { data };
            } catch (error) {
                if ((error as Error)?.name === 'AbortError') {
                    return { error: `Request timeout after ${PROXY_TIMEOUT_MS}ms` };
                }
                return { error: (error as Error)?.message || 'Proxy request failed' };
            }
        }
        case 'MCP_DETECTED': {
            // Update badge to show detected tool count
            const tabId = sender.tab?.id;
            if (tabId) {
                const count = msg.toolCount;
                await chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : '' });
                await chrome.action.setBadgeBackgroundColor({ tabId, color: '#6C5CE7' });
            }
            return { ok: true };
        }
        case 'PAGE_CHAT_STATUS': {
            return { ok: true };
        }
        // GET_ACTIVE_TAB_CHAT_STATUS removed as it's unreliable
        case 'GET_CONVERSATIONS': {
            const conversations = await getConversations(msg.domain);
            return { type: 'CONVERSATIONS_RESULT', conversations };
        }
        case 'SAVE_CONVERSATION': {
            await saveConversation(msg.conversation);
            return { ok: true };
        }
        case 'DELETE_CONVERSATION': {
            await deleteConversation(msg.conversationId);
            return { ok: true };
        }
        case 'LIST_REMOTE_REPOS': {
            const items = msg.hostname
                ? await getRemoteRepositoriesForHost(msg.hostname)
                : await getRemoteRepositories();
            return { type: 'REMOTE_REPOS_RESULT', items };
        }
        case 'TOGGLE_REMOTE_REPO': {
            const current = await getRemoteRepositories();
            const next = toggleRemoteRepoEnabled(current, msg.repoId, msg.enabled);
            await saveRemoteRepositories(next);
            return { ok: true };
        }
        case 'DELETE_REMOTE_REPO': {
            const current = await getRemoteRepositories();
            const next = deleteRemoteRepoById(current, msg.repoId);
            await saveRemoteRepositories(next);
            return { ok: true };
        }
        case 'LIST_MCP_SKILLS_REPOS': {
            const items = msg.hostname
                ? await getMcpSkillsRepositoriesForHost(msg.hostname)
                : await getMcpSkillsRepositories();
            return { type: 'MCP_SKILLS_REPOS_RESULT', items };
        }
        case 'UPSERT_MCP_SKILLS_REPO': {
            const current = await getMcpSkillsRepositories();
            const next = upsertMcpSkillsRepo(current, msg.repo);
            await saveMcpSkillsRepositories(next);
            return { ok: true };
        }
        case 'TOGGLE_MCP_SKILLS_REPO': {
            const current = await getMcpSkillsRepositories();
            const next = toggleMcpSkillsRepoEnabled(current, msg.repoId, msg.enabled);
            await saveMcpSkillsRepositories(next);
            return { ok: true };
        }
        case 'DELETE_MCP_SKILLS_REPO': {
            const current = await getMcpSkillsRepositories();
            const next = deleteMcpSkillsRepoById(current, msg.repoId);
            await saveMcpSkillsRepositories(next);
            return { ok: true };
        }
        case 'OPEN_OPTIONS': {
            if (msg.domain) {
                let url = `options.html?domain=${encodeURIComponent(msg.domain)}`;
                if (msg.hasNativeChat) url += `&hasNativeChat=1`;
                chrome.tabs.create({ url: chrome.runtime.getURL(url) });
            } else {
                chrome.runtime.openOptionsPage();
            }
            return { ok: true };
        }
        case 'CALL_REMOTE_TOOL': {
            const settings = await getSettings();
            // Validate the market origin (the site that installed the repo) is in the whitelist.
            // apiBase is the backend API host and may differ (e.g. localhost in dev).
            let originOk = false;
            try {
                const marketOrigin = new URL(msg.marketOrigin).origin.toLowerCase();
                originOk = settings.allowedMarketOrigins.some((o) => {
                    try { return new URL(o).origin.toLowerCase() === marketOrigin; } catch { return false; }
                });
            } catch { /* invalid URL */ }
            if (!originOk) {
                return { error: `Market origin not in allowed list: ${msg.marketOrigin}` };
            }
            const toolUrl = `${msg.apiBase.replace(/\/+$/, '')}/repositories/${msg.repositoryId}/tools/${encodeURIComponent(msg.toolName)}/execute`;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
                const response = await fetch(toolUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ args: msg.args }),
                    signal: controller.signal,
                }).finally(() => clearTimeout(timeoutId));
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const message = (data as any)?.error?.message || `HTTP ${response.status}`;
                    return { error: message };
                }
                return { data };
            } catch (error) {
                if ((error as Error)?.name === 'AbortError') {
                    return { error: `Remote tool request timeout after ${PROXY_TIMEOUT_MS}ms` };
                }
                return { error: (error as Error)?.message || 'Remote tool request failed' };
            }
        }
        default:
            return { error: 'Unknown message type' };
    }
}

async function handleExternalInstall(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
    if (!message || typeof message !== 'object' || (message as Record<string, unknown>).type !== 'INSTALL_REPOSITORY') {
        return { ok: false, error: 'Unknown external message type' };
    }

    const settings = await getSettings();
    const check = validateExternalInstall(
        sender.origin,
        (message as Record<string, unknown>).payload,
        settings.allowedMarketOrigins
    );
    if (!check.ok) {
        console.warn('[Page MCP] external install rejected', {
            origin: sender.origin,
            error: check.error,
        });
        return check;
    }

    // Store in McpSkills storage so Options MCP/Skills tab and popup can see it
    const current = await getMcpSkillsRepositories();
    const next = upsertInstalledRepo(current, check.payload);
    try {
        await saveMcpSkillsRepositories(next);
    } catch (error) {
        console.error('[Page MCP] external install save failed', error);
        throw error;
    }

    const targetKey = buildRepoKey(check.payload.repositoryId, check.payload.siteDomain, check.payload.marketOrigin);
    const record = next.find((item) => buildRepoKey(item.repositoryId, item.siteDomain, item.marketOrigin) === targetKey);
    return { ok: true, record };
}

// ---- Extension Icon Click → Open Options ----

chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
});

console.log('[Page MCP] Background service worker started');

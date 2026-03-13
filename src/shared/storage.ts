// ============================================================
// Page MCP Plugin — Chrome Storage Helpers
// ============================================================

import { DEFAULT_SETTINGS } from './types.js';
import type { PluginSettings, Conversation, InstalledRemoteRepository, McpSkillsRepository } from './types.js';
import { buildDomainIndex, lookupRepoIdsForHost, type RemoteRepoDomainIndex } from './remote-repo-index.js';
import { normalizeInstalledRepo } from './remote-repos.js';

const SETTINGS_KEY = 'pageMcpSettings';
const CONVERSATIONS_KEY = 'pageMcpConversations';
const REMOTE_REPOS_KEY = 'pageMcpRemoteRepos';
const REMOTE_REPO_INDEX_KEY = 'pageMcpRemoteRepoIds';
const REMOTE_REPO_KEY_PREFIX = 'pageMcpRemoteRepo:';
const REMOTE_REPO_DOMAIN_INDEX_KEY = 'pageMcpRemoteRepoDomainIndex';
const MCP_SKILLS_REPOS_KEY = 'pageMcpMcpSkillsRepos';
const MCP_SKILLS_REPO_INDEX_KEY = 'pageMcpMcpSkillsRepoIds';
const MCP_SKILLS_REPO_KEY_PREFIX = 'pageMcpMcpSkillsRepo:';
const MCP_SKILLS_REPO_DOMAIN_INDEX_KEY = 'pageMcpMcpSkillsRepoDomainIndex';

// ---- Settings ----

export async function getSettings(): Promise<PluginSettings> {
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
}

export async function saveSettings(partial: Partial<PluginSettings>): Promise<PluginSettings> {
    const current = await getSettings();
    const merged = { ...current, ...partial };
    await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
    return merged;
}

export function onSettingsChange(callback: (settings: PluginSettings) => void): void {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[SETTINGS_KEY]) {
            callback(changes[SETTINGS_KEY].newValue as PluginSettings);
        }
    });
}

// ---- Conversations (domain-isolated) ----

export async function getConversations(domain?: string): Promise<Conversation[]> {
    const result = await chrome.storage.local.get(CONVERSATIONS_KEY);
    const all: Conversation[] = result[CONVERSATIONS_KEY] ?? [];
    if (domain) {
        return all.filter(c => c.domain === domain);
    }
    return all;
}

export async function saveConversation(conv: Conversation): Promise<void> {
    const result = await chrome.storage.local.get(CONVERSATIONS_KEY);
    const all: Conversation[] = result[CONVERSATIONS_KEY] ?? [];
    const index = all.findIndex(c => c.id === conv.id);
    if (index >= 0) {
        all[index] = conv;
    } else {
        all.unshift(conv);
    }
    // Keep max 50 conversations per domain, 200 total
    const domainCount = new Map<string, number>();
    const filtered = all.filter(c => {
        const count = (domainCount.get(c.domain) ?? 0) + 1;
        domainCount.set(c.domain, count);
        return count <= 50;
    });
    if (filtered.length > 200) filtered.length = 200;
    await chrome.storage.local.set({ [CONVERSATIONS_KEY]: filtered });
}

export async function deleteConversation(id: string): Promise<void> {
    const result = await chrome.storage.local.get(CONVERSATIONS_KEY);
    const all: Conversation[] = result[CONVERSATIONS_KEY] ?? [];
    const filtered = all.filter(c => c.id !== id);
    await chrome.storage.local.set({ [CONVERSATIONS_KEY]: filtered });
}

// ---- Installed remote repositories ----

export async function getRemoteRepositories(): Promise<InstalledRemoteRepository[]> {
    const indexResult = await chrome.storage.local.get(REMOTE_REPO_INDEX_KEY);
    const ids: string[] = indexResult[REMOTE_REPO_INDEX_KEY] ?? [];
    if (ids.length > 0) {
        const keys = ids.map((id) => `${REMOTE_REPO_KEY_PREFIX}${id}`);
        const rows = await chrome.storage.local.get(keys);
        return ids
            .map((id) => rows[`${REMOTE_REPO_KEY_PREFIX}${id}`] as InstalledRemoteRepository | undefined)
            .filter(Boolean)
            .map((item) => normalizeInstalledRepo(item as InstalledRemoteRepository));
    }

    // Backward compatibility for old single-key storage
    const legacy = await chrome.storage.local.get(REMOTE_REPOS_KEY);
    const items: InstalledRemoteRepository[] = legacy[REMOTE_REPOS_KEY] ?? [];
    if (items.length > 0) {
        await saveRemoteRepositories(items.map((item) => normalizeInstalledRepo(item)));
    }
    return items.map((item) => normalizeInstalledRepo(item));
}

export async function getRemoteRepositoriesForHost(hostname: string): Promise<InstalledRemoteRepository[]> {
    const indexResult = await chrome.storage.local.get([REMOTE_REPO_INDEX_KEY, REMOTE_REPO_DOMAIN_INDEX_KEY]);
    const ids: string[] = indexResult[REMOTE_REPO_INDEX_KEY] ?? [];
    const domainIndex = indexResult[REMOTE_REPO_DOMAIN_INDEX_KEY] as RemoteRepoDomainIndex | undefined;
    if (!domainIndex || ids.length === 0) return getRemoteRepositories();

    const matchedIds = lookupRepoIdsForHost(domainIndex, hostname);
    if (matchedIds.length === 0) return [];
    const keys = matchedIds.map((id) => `${REMOTE_REPO_KEY_PREFIX}${id}`);
    const rows = await chrome.storage.local.get(keys);
    return matchedIds
        .map((id) => rows[`${REMOTE_REPO_KEY_PREFIX}${id}`] as InstalledRemoteRepository | undefined)
        .filter(Boolean)
        .map((item) => normalizeInstalledRepo(item as InstalledRemoteRepository));
}

export async function saveRemoteRepositories(items: InstalledRemoteRepository[]): Promise<void> {
    const normalizedItems = items.map((item) => normalizeInstalledRepo(item));
    const nextIds = normalizedItems.map((item) => item.id);
    const prevIndexResult = await chrome.storage.local.get(REMOTE_REPO_INDEX_KEY);
    const prevIds: string[] = prevIndexResult[REMOTE_REPO_INDEX_KEY] ?? [];

    const payload: Record<string, unknown> = {
        [REMOTE_REPO_INDEX_KEY]: nextIds,
        [REMOTE_REPO_DOMAIN_INDEX_KEY]: buildDomainIndex(normalizedItems),
    };
    for (const item of normalizedItems) {
        payload[`${REMOTE_REPO_KEY_PREFIX}${item.id}`] = item;
    }
    await chrome.storage.local.set(payload);

    const staleKeys = prevIds
        .filter((id) => !nextIds.includes(id))
        .map((id) => `${REMOTE_REPO_KEY_PREFIX}${id}`);
    if (staleKeys.length > 0) {
        await chrome.storage.local.remove(staleKeys);
    }
    // Cleanup old monolithic key to avoid duplicate large snapshots causing quota pressure.
    await chrome.storage.local.remove(REMOTE_REPOS_KEY);
}

// ---- MCP/skills repositories created from options ----

export async function getMcpSkillsRepositories(): Promise<McpSkillsRepository[]> {
    const indexResult = await chrome.storage.local.get(MCP_SKILLS_REPO_INDEX_KEY);
    const ids: string[] = indexResult[MCP_SKILLS_REPO_INDEX_KEY] ?? [];
    if (ids.length > 0) {
        const keys = ids.map((id) => `${MCP_SKILLS_REPO_KEY_PREFIX}${id}`);
        const rows = await chrome.storage.local.get(keys);
        return ids
            .map((id) => rows[`${MCP_SKILLS_REPO_KEY_PREFIX}${id}`] as McpSkillsRepository | undefined)
            .filter(Boolean)
            .map((item) => normalizeInstalledRepo(item as McpSkillsRepository));
    }

    const legacy = await chrome.storage.local.get(MCP_SKILLS_REPOS_KEY);
    const items: McpSkillsRepository[] = legacy[MCP_SKILLS_REPOS_KEY] ?? [];
    if (items.length > 0) {
        await saveMcpSkillsRepositories(items.map((item) => normalizeInstalledRepo(item)));
    }
    return items.map((item) => normalizeInstalledRepo(item));
}

export async function getMcpSkillsRepositoriesForHost(hostname: string): Promise<McpSkillsRepository[]> {
    const indexResult = await chrome.storage.local.get([MCP_SKILLS_REPO_INDEX_KEY, MCP_SKILLS_REPO_DOMAIN_INDEX_KEY]);
    const ids: string[] = indexResult[MCP_SKILLS_REPO_INDEX_KEY] ?? [];
    const domainIndex = indexResult[MCP_SKILLS_REPO_DOMAIN_INDEX_KEY] as RemoteRepoDomainIndex | undefined;
    if (!domainIndex || ids.length === 0) return getMcpSkillsRepositories();

    const matchedIds = lookupRepoIdsForHost(domainIndex, hostname);
    if (matchedIds.length === 0) return [];
    const keys = matchedIds.map((id) => `${MCP_SKILLS_REPO_KEY_PREFIX}${id}`);
    const rows = await chrome.storage.local.get(keys);
    return matchedIds
        .map((id) => rows[`${MCP_SKILLS_REPO_KEY_PREFIX}${id}`] as McpSkillsRepository | undefined)
        .filter(Boolean)
        .map((item) => normalizeInstalledRepo(item as McpSkillsRepository));
}

export async function saveMcpSkillsRepositories(items: McpSkillsRepository[]): Promise<void> {
    const normalizedItems = items.map((item) => normalizeInstalledRepo(item));
    const nextIds = normalizedItems.map((item) => item.id);
    const prevIndexResult = await chrome.storage.local.get(MCP_SKILLS_REPO_INDEX_KEY);
    const prevIds: string[] = prevIndexResult[MCP_SKILLS_REPO_INDEX_KEY] ?? [];

    const payload: Record<string, unknown> = {
        [MCP_SKILLS_REPO_INDEX_KEY]: nextIds,
        [MCP_SKILLS_REPO_DOMAIN_INDEX_KEY]: buildDomainIndex(normalizedItems),
    };
    for (const item of normalizedItems) {
        payload[`${MCP_SKILLS_REPO_KEY_PREFIX}${item.id}`] = item;
    }
    await chrome.storage.local.set(payload);

    const staleKeys = prevIds
        .filter((id) => !nextIds.includes(id))
        .map((id) => `${MCP_SKILLS_REPO_KEY_PREFIX}${id}`);
    if (staleKeys.length > 0) {
        await chrome.storage.local.remove(staleKeys);
    }
    await chrome.storage.local.remove(MCP_SKILLS_REPOS_KEY);
}

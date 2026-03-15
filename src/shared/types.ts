// ============================================================
// Page MCP Plugin — Shared Types
// ============================================================

export interface StoredMcpTool {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
    title?: string;
    /** JS function string for page-level execution, e.g. `(args) => { ... }` */
    execute?: string;
}

export interface StoredMcpPromptArgument {
    name: string;
    description?: string;
    required?: boolean;
}

export interface StoredMcpPrompt {
    name: string;
    description?: string;
    arguments?: StoredMcpPromptArgument[];
    messages?: Array<Record<string, unknown>>;
    title?: string;
}

export interface StoredMcpResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}

export interface StoredMcpSnapshot {
    tools: StoredMcpTool[];
    prompts: StoredMcpPrompt[];
    resources: StoredMcpResource[];
}

/** Plugin settings persisted in chrome.storage.local */
export interface PluginSettings {
    // AI Model
    apiKey: string;
    baseURL: string;
    model: string;
    // General
    language: 'zh' | 'en';
    // UI
    theme: 'dark' | 'light' | 'auto';
    accentColor: string;
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    // Features
    autoDetect: boolean;
    remoteLoadingEnabled: boolean;
    allowedMarketOrigins: string[];
    alwaysInjectChat: boolean;
    injectChatOnResources: boolean;
    // Page Chat Override
    overridePageChat: boolean;
    overrideSites: string[]; // List of hostnames where page chat is overridden
    // Security
    encryptLocal: boolean;
    autoClearChat: boolean;
    confirmToolCall: boolean;
    filterSensitive: boolean;
}

/** A saved conversation */
export interface Conversation {
    id: string;
    title: string;
    domain: string; // Domain isolation key (hostname)
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
}

/** Chat message */
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
    hidden?: boolean;
    toolCalls?: ToolCallInfo[];
    toolCallId?: string;
}

/** Tool call info */
export interface ToolCallInfo {
    id: string;
    name: string;
    args: Record<string, unknown>;
    status: 'calling' | 'success' | 'error';
    result?: unknown;
    error?: string;
}

export interface InstalledRemoteRepository {
    id: string;
    repositoryId: string;
    repositoryName: string;
    siteDomain: string;
    release: string;
    apiBase: string;
    marketOrigin: string;
    marketDetailUrl: string;
    mcp: StoredMcpSnapshot;
    installSnapshot: InstallSnapshotPayload;
    integrity?: IntegrityPayload;
    enabled: boolean;
    allowWithoutConfirm?: boolean;
    installedAt: number;
    updatedAt: number;
}

export type McpSkillsRepository = InstalledRemoteRepository;

export interface IntegrityPayload {
    algorithm: string;
    digest: string;
}

export interface SnapshotSkillItem {
    id?: string;
    repositoryId?: string;
    releaseId?: string;
    name: string;
    description?: string | null;
    version: string;
    skillMd: string;
    run?: string | null;
    path: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface InstallSnapshotPayload {
    repository: {
        id: string;
        name: string;
        description: string | null;
        siteDomain: string;
        author: {
            id: string;
            name: string;
        };
        starsCount: number;
        usageCount: number;
        lastActiveAt: string | null;
        latestReleaseVersion: string | null;
    };
    release: {
        id: string;
        repositoryId: string;
        version: string;
        name: string | null;
        changelog: string | null;
        isLatest: boolean;
        createdAt: string;
    };
    snapshot: {
        mcp: StoredMcpSnapshot;
        skills: SnapshotSkillItem[];
    };
    integrity: IntegrityPayload;
}

export interface RemoteInstallRequest {
    repositoryId: string;
    repositoryName: string;
    siteDomain: string;
    release: string;
    apiBase: string;
    marketOrigin: string;
    marketDetailUrl: string;
    mcp?: StoredMcpSnapshot;
    installSnapshot: InstallSnapshotPayload;
    integrity?: IntegrityPayload;
}

/** Messages between content script and background */
export type PluginMessage =
    | { type: 'GET_SETTINGS'; }
    | { type: 'SETTINGS_RESULT'; settings: PluginSettings; }
    | { type: 'SAVE_SETTINGS'; settings: Partial<PluginSettings>; }
    | { type: 'PROXY_API_CALL'; endpoint: string; payload: Record<string, unknown>; }
    | { type: 'MCP_DETECTED'; tabId?: number; hostInfo: { name: string; version: string }; toolCount: number; }
    | { type: 'GET_CONVERSATIONS'; domain?: string; }
    | { type: 'CONVERSATIONS_RESULT'; conversations: Conversation[]; }
    | { type: 'SAVE_CONVERSATION'; conversation: Conversation; }
    | { type: 'DELETE_CONVERSATION'; conversationId: string; }
    | { type: 'SETTINGS_CHANGED'; settings: PluginSettings; }
    | { type: 'PAGE_CHAT_STATUS'; hasNativeChat: boolean; domain: string; }
    | { type: 'QUERY_PAGE_CHAT_STATUS'; }
    | { type: 'QUERY_PAGE_MCP_CAPABILITIES'; }
    | { type: 'LIST_REMOTE_REPOS'; hostname?: string; }
    | { type: 'REMOTE_REPOS_RESULT'; items: InstalledRemoteRepository[]; }
    | { type: 'TOGGLE_REMOTE_REPO'; repoId: string; enabled: boolean; }
    | { type: 'DELETE_REMOTE_REPO'; repoId: string; }
    | { type: 'LIST_MCP_SKILLS_REPOS'; hostname?: string; }
    | { type: 'MCP_SKILLS_REPOS_RESULT'; items: McpSkillsRepository[]; }
    | { type: 'UPSERT_MCP_SKILLS_REPO'; repo: McpSkillsRepository; }
    | { type: 'TOGGLE_MCP_SKILLS_REPO'; repoId: string; enabled: boolean; }
    | { type: 'DELETE_MCP_SKILLS_REPO'; repoId: string; }
    | { type: 'GET_ACTIVE_TAB_CHAT_STATUS'; }
    | { type: 'OPEN_OPTIONS'; domain?: string; hasNativeChat?: boolean; }
    | { type: 'CALL_REMOTE_TOOL'; apiBase: string; repositoryId: string; marketOrigin: string; toolName: string; args: Record<string, unknown>; }
    | { type: 'EXECUTE_REMOTE_TOOL_IN_PAGE'; executeStr: string; args: Record<string, unknown>; };

export const DEFAULT_SETTINGS: PluginSettings = {
    apiKey: '',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    language: 'zh',
    theme: 'dark',
    accentColor: '#6C5CE7',
    position: 'bottom-right',
    autoDetect: true,
    remoteLoadingEnabled: true,
    allowedMarketOrigins: ['https://market.page-mcp.org'],
    alwaysInjectChat: false,
    injectChatOnResources: true,
    overridePageChat: false,
    overrideSites: [],
    encryptLocal: true,
    autoClearChat: false,
    confirmToolCall: true,
    filterSensitive: false,
};

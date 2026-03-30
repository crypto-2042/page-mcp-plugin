import type { PluginSettings } from './types.js';
import { DEFAULT_SETTINGS } from './types.js';

export type LocaleDictionary = Record<string, { message: string }>;

export async function loadSettingsAndLocale(
    fetchImpl: typeof fetch = fetch
): Promise<{ settings: PluginSettings; dict: LocaleDictionary }> {
    const result = await chrome.storage.local.get('pageMcpSettings');
    const settings = { ...DEFAULT_SETTINGS, ...(result.pageMcpSettings || {}) };
    const url = chrome.runtime.getURL(`_locales/${settings.language || 'zh'}/messages.json`);
    const response = await fetchImpl(url);
    const dict = await response.json() as LocaleDictionary;
    return { settings, dict };
}

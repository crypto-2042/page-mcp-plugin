import { useEffect, useRef, useState } from 'react';
import type { PluginSettings } from '../../shared/types.js';
import { DEFAULT_SETTINGS } from '../../shared/types.js';
import { safeRuntimeMessage } from '../safe-runtime.js';

export function usePluginSettings() {
    const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
    const [isLoaded, setIsLoaded] = useState(false);
    const settingsRef = useRef<PluginSettings>(DEFAULT_SETTINGS);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        (async () => {
            const res = await safeRuntimeMessage<{ settings?: PluginSettings }>('GET_SETTINGS', { type: 'GET_SETTINGS' });
            if (res?.settings) {
                setSettings(res.settings);
                settingsRef.current = res.settings;
            }
            setIsLoaded(true);
        })();

        const onSettingsMsg = (msg: { type: string; settings?: PluginSettings }) => {
            if (msg.type === 'SETTINGS_CHANGED' && msg.settings) {
                setSettings(msg.settings);
                settingsRef.current = msg.settings;
            }
        };
        chrome.runtime.onMessage.addListener(onSettingsMsg);

        return () => {
            chrome.runtime.onMessage.removeListener(onSettingsMsg);
        };
    }, []);

    const t = (key: string, subs?: Record<string, string>) => {
        let msg = '';
        try {
            msg = chrome.i18n.getMessage(key);
        } catch { }
        msg = msg || key;
        if (subs && typeof subs === 'object') {
            Object.entries(subs).forEach(([k, v]) => {
                msg = msg.replace('{' + k + '}', String(v));
            });
        }
        return msg;
    };

    return { settings, setSettings, settingsRef, isLoaded, t };
}

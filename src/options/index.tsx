import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SETTINGS, PluginSettings, McpSkillsRepository } from '../shared/types.js';
import { loadSettingsAndLocale } from '../shared/locale-loader.js';
import './styles.css';
import { addMarketOrigin, filterRemoteRepos, normalizeMarketOrigin, removeMarketOrigin, setRepoAllowWithoutConfirm } from './options-remote-services.js';
import { MaterialSymbolIcon } from './material-symbol-icon.js';

const OptionsApp: React.FC = () => {
    const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
    const [savedSettings, setSavedSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
    const [tab, setTab] = useState('general');
    const [dirty, setDirty] = useState(false);
    const [mcpSkillsRepos, setMcpSkillsRepos] = useState<McpSkillsRepository[]>([]);
    const [mcpSkillsQuery, setMcpSkillsQuery] = useState('');
    const [mcpSkillsLoading, setMcpSkillsLoading] = useState(false);
    const [newMarketOrigin, setNewMarketOrigin] = useState('');
    const [confirmDeleteRepo, setConfirmDeleteRepo] = useState<McpSkillsRepository | null>(null);

    // Dynamic UI states
    const [newSite, setNewSite] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [showManualModel, setShowManualModel] = useState(false);
    const [manualModel, setManualModel] = useState('');

    // Additional testing/fetching states
    const [modelsInfo, setModelsInfo] = useState<{ models: string[], status: string, fetching: boolean, error?: string }>({ models: [], status: '', fetching: false });
    const [testResult, setTestResult] = useState<{ msg: string, isError: boolean, isTesting: boolean } | null>(null);

    const [dict, setDict] = useState<Record<string, {message: string}>>({});
    const [localeReady, setLocaleReady] = useState(false);
    
    const t = (key: string, subs?: Record<string, string> | any) => {
        let msg = dict[key]?.message || key;
        if (subs && typeof subs === 'object' && !Array.isArray(subs)) {
            Object.entries(subs).forEach(([k, v]) => {
                msg = msg.replace('{' + k + '}', String(v));
            });
        }
        return msg;
    };



    useEffect(() => {
        let mounted = true;
        try {
            loadSettingsAndLocale()
                .then(({ settings: mem, dict }) => {
                    if (!mounted) return;
                    setSettings(mem);
                    setSavedSettings(mem);
                    setDict(dict);
                    setLocaleReady(true);
                })
                .catch(() => {
                    if (!mounted) return;
                    setLocaleReady(true);
                });
        } catch (e) {
            console.warn('Fallback to DEFAULT_SETTINGS since chrome.storage is missing');
            setLocaleReady(true);
        }

        applyTheme(settings.theme);
        applyAccent(settings.accentColor);

        // Listen to settings changes from other parts
        try {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.pageMcpSettings) {
                    const mem = { ...DEFAULT_SETTINGS, ...(changes.pageMcpSettings.newValue || {}) };
                    if (!dirty) {
                        setSettings(mem);
                        setSavedSettings(mem);
                    }
                    loadSettingsAndLocale()
                        .then(({ dict }) => {
                            if (!mounted) return;
                            setDict(dict);
                            setLocaleReady(true);
                        })
                        .catch(() => {
                            if (!mounted) return;
                            setLocaleReady(true);
                        });
                }
                // Detect any McpSkills repo storage change (both legacy single-key and new per-item keys)
                const mcpSkillsChanged = Object.keys(changes).some(
                    (k) => k === 'pageMcpMcpSkillsRepos' || k === 'pageMcpMcpSkillsRepoIds' || k.startsWith('pageMcpMcpSkillsRepo:')
                );
                if (area === 'local' && mcpSkillsChanged) {
                    // Reload all repos from background to get normalized, complete list
                    chrome.runtime.sendMessage({ type: 'LIST_MCP_SKILLS_REPOS' })
                        .then((resp: any) => setMcpSkillsRepos(resp?.items || []))
                        .catch(() => {});
                }
            });
        } catch (e) { }

        const loadMcpSkillsRepos = async () => {
            setMcpSkillsLoading(true);
            try {
                const response = await chrome.runtime.sendMessage({ type: 'LIST_MCP_SKILLS_REPOS' });
                setMcpSkillsRepos(response?.items || []);
            } catch (err) {
                console.warn('Failed to load mcp/skills repositories', err);
                setMcpSkillsRepos([]);
            } finally {
                setMcpSkillsLoading(false);
            }
        };
        loadMcpSkillsRepos();

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        setDirty(JSON.stringify(settings) !== JSON.stringify(savedSettings));
        applyTheme(settings.theme);
        applyAccent(settings.accentColor);
    }, [settings, savedSettings]);

    const applyTheme = (theme: string) => {
        const root = document.documentElement;
        if (theme === 'light' || (theme === 'auto' && !window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            root.classList.add('light');
            root.classList.remove('dark');
        } else {
            root.classList.add('dark');
            root.classList.remove('light');
        }
    };

    const applyAccent = (color: string) => {
        document.documentElement.style.setProperty('--primary', color);
        // compute lighter variants
        document.documentElement.style.setProperty('--s-accent', color);
    };

    const updateSetting = <K extends keyof PluginSettings>(key: K, val: PluginSettings[K]) => {
        setSettings(p => ({ ...p, [key]: val }));
    };

    const saveSettings = async () => {
        try {
            await chrome.storage.local.set({ pageMcpSettings: settings });
            setSavedSettings(settings);
            setDirty(false);
            showToast(t('toastSaved'));
        } catch (err: any) {
            showToast(t('toastSaveFail') + err);
        }
    };

    const discardChanges = () => {
        setSettings(savedSettings);
        setDirty(false);
        showToast(t('toastDiscarded'));
    };

    const showToast = (msg: string) => {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 3000);
    };

    const addSite = () => {
        const s = newSite.trim();
        if (!s) return;
        if (!s.includes('.') && s !== 'localhost') {
            showToast(t('toastInvalidHost'));
            return;
        }
        if (settings.overrideSites.includes(s)) {
            showToast(t('toastDupSite'));
            return;
        }
        updateSetting('overrideSites', [...settings.overrideSites, s]);
        setNewSite('');
    };

    const removeSite = (st: string) => {
        updateSetting('overrideSites', settings.overrideSites.filter(x => x !== st));
    };

    const filteredMcpSkillsRepos = filterRemoteRepos(mcpSkillsRepos, mcpSkillsQuery);

    const toggleMcpSkillsRepo = async (repoId: string, enabled: boolean) => {
        await chrome.runtime.sendMessage({ type: 'TOGGLE_MCP_SKILLS_REPO', repoId, enabled });
        setMcpSkillsRepos((prev) => prev.map((item) => item.id === repoId ? { ...item, enabled } : item));
    };

    const toggleRepoAllowWithoutConfirm = async (repoId: string, allowWithoutConfirm: boolean) => {
        const repo = mcpSkillsRepos.find((item) => item.id === repoId);
        if (!repo) return;
        const next = { ...repo, allowWithoutConfirm };
        await chrome.runtime.sendMessage({ type: 'UPSERT_MCP_SKILLS_REPO', repo: next });
        setMcpSkillsRepos((prev) => setRepoAllowWithoutConfirm(prev, repoId, allowWithoutConfirm));
    };

    const deleteMcpSkillsRepo = async (repoId: string) => {
        await chrome.runtime.sendMessage({ type: 'DELETE_MCP_SKILLS_REPO', repoId });
        setMcpSkillsRepos((prev) => prev.filter((item) => item.id !== repoId));
    };

    const addMarketOriginSetting = () => {
        const normalized = normalizeMarketOrigin(newMarketOrigin);
        if (!normalized) {
            showToast(t('toastInvalidHost'));
            return;
        }
        const next = addMarketOrigin(settings.allowedMarketOrigins, normalized);
        if (next.length === settings.allowedMarketOrigins.length) {
            showToast(t('toastDupSite'));
            return;
        }
        updateSetting('allowedMarketOrigins', next);
        setNewMarketOrigin('');
    };

    const removeMarketOriginSetting = (origin: string) => {
        updateSetting('allowedMarketOrigins', removeMarketOrigin(settings.allowedMarketOrigins, origin));
    };

    const updateRemoteToolTimeoutSeconds = (value: string) => {
        const parsed = Number.parseInt(value, 10);
        updateSetting('remoteToolTimeoutSeconds', Number.isFinite(parsed) ? Math.max(1, parsed) : DEFAULT_SETTINGS.remoteToolTimeoutSeconds);
    };

    const updateRemoteToolMaxRetries = (value: string) => {
        const parsed = Number.parseInt(value, 10);
        updateSetting('remoteToolMaxRetries', Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_SETTINGS.remoteToolMaxRetries);
    };

    const fetchModels = async () => {
        if (!settings.apiKey) {
            setModelsInfo({ models: [], status: t('modelFetchNoKey'), fetching: false, error: 'no-key' });
            return;
        }
        setModelsInfo({ models: [], status: t('modelFetching'), fetching: true });
        try {
            const url = settings.baseURL.endsWith('/v1') ? `${settings.baseURL}/models` : `${settings.baseURL}/v1/models`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${settings.apiKey}` }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const mods = data.data.map((m: any) => m.id);
            if (!mods.includes(settings.model) && mods.length > 0) {
                updateSetting('model', mods[0] || '');
            }
            // Use translation string correctly
            setModelsInfo({ models: mods, status: t('modelFetched', { n: String(mods.length) }), fetching: false });
        } catch (err: any) {
            const current = settings.model;
            // Use translation string correctly
            setModelsInfo({ models: current ? [current] : [], status: t('modelFetchFail', { e: err.message }), fetching: false, error: 'error' });
        }
    };

    const testConnection = async () => {
        if (!settings.apiKey) {
            setTestResult({ msg: t('testNoKey'), isError: true, isTesting: false });
            return;
        }
        setTestResult({ msg: t('testTesting'), isError: false, isTesting: true });
        try {
            const url = settings.baseURL.endsWith('/v1') ? `${settings.baseURL}/models` : `${settings.baseURL}/v1/models`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${settings.apiKey}` } });
            if (res.ok) {
                setTestResult({ msg: t('testSuccess'), isError: false, isTesting: false });
            } else {
                throw new Error(`HTTP ${res.status}`);
            }
        } catch (err: any) {
            setTestResult({ msg: `Error: ${err.message}`, isError: true, isTesting: false });
        }
    };

    if (!localeReady) {
        return <div id="app" />;
    }

    return (
        <div className="settings-shell" id="app">
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <div className="brand-icon" style={{ background: 'transparent', boxShadow: 'none' }}>
                        <img src="../assets/icon-48.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '10px' }} />
                    </div>
                    <h1 className="brand-title">Page MCP</h1>
                </div>

                <nav className="sidebar-nav" id="sidebarNav">
                    {[
                        { id: 'general', icon: 'tune', label: t('navGeneral') },
                        { id: 'model', icon: 'psychology', label: t('navModel') },
                        { id: 'interface', icon: 'palette', label: t('navInterface') },
                        // { id: 'security', icon: 'shield_lock', label: t('navSecurity') },
                        { id: 'remote', icon: 'cloud_sync', label: t('navRemoteServices') || 'MCP/Skills' },
                        { id: 'other', icon: 'more_horiz', label: t('navOther') }
                    ].map(nav => (
                        <a
                            key={nav.id}
                            href="#"
                            className={`nav-item ${tab === nav.id ? 'active' : ''}`}
                            onClick={(e) => { e.preventDefault(); setTab(nav.id); }}
                        >
                            <MaterialSymbolIcon name={nav.icon} />
                            <span className="nav-label">{nav.label}</span>
                        </a>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <p className="version-text">v1.1.0</p>
                </div>
            </aside>

            <main className="main-content">
                {/* General Tab */}
                <section className={`tab-panel ${tab === 'general' ? 'active' : ''}`}>
                    <header className="panel-header">
                        <h2 className="panel-title">{t('generalTitle')}</h2>
                        <p className="panel-desc">{t('generalDesc')}</p>
                    </header>
                    <div className="panel-body">
                        {/* Language */}
                        <div className="glass-card">
                            <div className="card-section-title">
                                <MaterialSymbolIcon name="translate" />
                                <span>{t('languageLabel')}</span>
                            </div>
                            <div className="radio-group">
                                <label className="radio-card">
                                    <input type="radio" name="language" checked={settings.language === 'zh'} onChange={() => updateSetting('language', 'zh')} />
                                    <span className="radio-card-label">🇨🇳 中文</span>
                                </label>
                                <label className="radio-card">
                                    <input type="radio" name="language" checked={settings.language === 'en'} onChange={() => updateSetting('language', 'en')} />
                                    <span className="radio-card-label">🇺🇸 English</span>
                                </label>
                            </div>
                        </div>

                        {/* Behaviors */}
                        <div className="glass-card">
                            <div className="card-row">
                                <div className="card-info">
                                    <div className="card-icon-wrap">
                                        <MaterialSymbolIcon name="radar" />
                                    </div>
                                    <div>
                                        <h3 className="card-title">{t('autoDetectTitle')}</h3>
                                        <p className="card-desc">{t('autoDetectDesc')}</p>
                                    </div>
                                </div>
                                <label className="toggle">
                                    <input type="checkbox" checked={settings.autoDetect} onChange={e => updateSetting('autoDetect', e.target.checked)} />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <div className="glass-card">
                            <div className="card-row">
                                <div className="card-info">
                                    <div className="card-icon-wrap">
                                        <MaterialSymbolIcon name="chat" />
                                    </div>
                                    <div>
                                        <h3 className="card-title">{t('alwaysInjectTitle') || "始终注入聊天"}</h3>
                                        <p className="card-desc">{t('alwaysInjectDesc') || "只有基础的 chat 功能，不会访问页面信息。"}</p>
                                    </div>
                                </div>
                                <label className="toggle">
                                    <input type="checkbox" checked={settings.alwaysInjectChat} onChange={e => updateSetting('alwaysInjectChat', e.target.checked)} />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <div className="glass-card">
                            <div className="card-row">
                                <div className="card-info">
                                    <div className="card-icon-wrap">
                                        <MaterialSymbolIcon name="extension" />
                                    </div>
                                    <div>
                                        <h3 className="card-title">{t('injectResourcesTitle') || "存在资源时注入"}</h3>
                                        <p className="card-desc">{t('injectResourcesDesc') || "检测到页面有 MCP/Skills 资源时才显示。"}</p>
                                    </div>
                                </div>
                                <label className="toggle">
                                    <input type="checkbox" checked={settings.injectChatOnResources} onChange={e => updateSetting('injectChatOnResources', e.target.checked)} />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <div className="glass-card">
                            <div className="card-section-title">
                                <MaterialSymbolIcon name="swap_horiz" />
                                <span>{t('overrideTitle')}</span>
                            </div>

                            <div className="card-row" style={{ marginTop: '12px' }}>
                                <div className="card-info">
                                    <div>
                                        <h3 className="card-title">{t('overrideChatTitle') || '接管原生对话窗口'}</h3>
                                        <p className="card-desc">{t('overrideChatDesc') || '如果网站本身提供了 @page-mcp/chat，用当前插件界面将其覆盖。'}</p>
                                    </div>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.overridePageChat}
                                        onChange={e => updateSetting('overridePageChat', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                            
                            <p className="card-desc" style={{ marginBottom: '16px' }}>{t('overrideDesc')}</p>

                            <div className="override-detected" style={{ display: 'none' }}>
                                <div className="override-detected-info">
                                    <span className="override-detected-dot"></span>
                                    <span><span>{t('overrideDetected') || "检测到原生聊天:"}</span> <strong id="detectedDomain"></strong></span>
                                </div>
                                <button type="button" className="btn btn-sm btn-outline">{t('overrideBtn') || "Override"}</button>
                            </div>

                            <div className="site-list">

                                {settings.overrideSites.length === 0 && <div style={{ fontSize: '13px', fontStyle: 'italic', color: '#888' }}>{t('siteEmpty')}</div>}
                                {settings.overrideSites.map(site => (
                                    <div key={site} className="site-item">
                                        <span className="site-hostname">{site}</span>
                                        <button onClick={() => removeSite(site)} className="btn-site-remove" aria-label={`remove-${site}`}>
                                            <span style={{ fontSize: '18px', lineHeight: 1, fontWeight: 700 }}>×</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="site-add-row" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                <input type="text" value={newSite} onChange={e => setNewSite(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSite()} placeholder={t('sitePlaceholder')} className="glass-input" style={{ flex: 1 }} />
                                <button type="button" onClick={addSite} className="btn btn-sm btn-accent" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <MaterialSymbolIcon name="add" style={{ fontSize: '16px' }} />
                                    {t('addBtn')}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Model Tab */}
                <section className={`tab-panel ${tab === 'model' ? 'active' : ''}`}>
                    <header className="panel-header">
                        <h2 className="panel-title">{t('modelTabTitle')}</h2>
                        <p className="panel-desc">{t('modelTabDesc')}</p>
                    </header>
                    <div className="panel-body">
                        <div className="glass-card">
                            <div className="card-row">
                                <div className="card-info">
                                    <div className="card-icon-wrap">
                                        <MaterialSymbolIcon name="key" />
                                    </div>
                                    <div>
                                        <h3 className="card-title">{t('apiKeyTitle')}</h3>
                                        <p className="card-desc">{t('apiKeyDesc') || "输入你的身份验证密钥"}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="input-password" style={{ marginTop: '16px', position: 'relative' }}>
                                <input type={showKey ? "text" : "password"} value={settings.apiKey} onChange={e => updateSetting('apiKey', e.target.value)} placeholder="sk-..." className="glass-input" style={{ width: '100%', paddingRight: '40px' }} />
                                <button type="button" onClick={() => setShowKey(!showKey)} className="btn-toggle-password" style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#888' }}>
                                    <MaterialSymbolIcon name={showKey ? 'visibility' : 'visibility_off'} />
                                </button>
                            </div>
                            <span className="form-hint" style={{ fontSize: '12px', color: '#888', marginTop: '8px', display: 'block' }}>{t('apiKeyHint')}</span>
                        </div>

                        <div className="glass-card">
                            <div className="card-row">
                                <div className="card-info">
                                    <div className="card-icon-wrap">
                                        <MaterialSymbolIcon name="link" />
                                    </div>
                                    <div>
                                        <h3 className="card-title">{t('baseUrlTitle')}</h3>
                                        <p className="card-desc">{t('baseUrlDesc') || "API基础地址"}</p>
                                    </div>
                                </div>
                            </div>
                            <input type="url" value={settings.baseURL} onChange={e => updateSetting('baseURL', e.target.value)} placeholder="https://api.openai.com/v1" className="glass-input" style={{ marginTop: '16px', width: '100%' }} />
                        </div>

                        <div className="glass-card">
                            <div className="card-row">
                                <div className="card-info">
                                    <div className="card-icon-wrap">
                                        <MaterialSymbolIcon name="smart_toy" />
                                    </div>
                                    <div>
                                        <h3 className="card-title">{t('modelTitle')}</h3>
                                        <p className="card-desc">{t('modelDesc') || "选择要使用的模型"}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="model-selector" style={{ marginTop: '16px' }}>
                                <div className="model-select-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <select value={settings.model} onChange={e => updateSetting('model', e.target.value)} className="glass-select" style={{ flex: 1 }}>
                                        <option value="">{t('modelPlaceholder')}</option>
                                        {settings.model && !modelsInfo.models.includes(settings.model) && (
                                            <option value={settings.model}>{settings.model}</option>
                                        )}
                                        {modelsInfo.models.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                    <button onClick={fetchModels} className="btn btn-sm btn-accent flex items-center justify-center p-2 rounded-lg">
                                        <MaterialSymbolIcon name="refresh" className={modelsInfo.fetching ? 'animate-spin' : ''} style={{ fontSize: '18px' }} />
                                    </button>
                                    <button onClick={() => setShowManualModel(!showManualModel)} className="btn btn-sm btn-outline flex items-center justify-center p-2 rounded-lg">
                                        <MaterialSymbolIcon name="add" style={{ fontSize: '18px' }} />
                                    </button>
                                </div>
                                {showManualModel && (
                                    <div className="model-manual-row" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                        <input type="text" value={manualModel} onChange={e => setManualModel(e.target.value)} placeholder="如 gpt-4o" className="glass-input" style={{ flex: 1 }} />
                                        <button onClick={() => { if (manualModel.trim()) { updateSetting('model', manualModel.trim()); setModelsInfo(p => ({ ...p, models: [...new Set([...p.models, manualModel.trim()])] })) } setShowManualModel(false); setManualModel(''); }} className="btn btn-sm btn-accent">{t('modelManualConfirm')}</button>
                                        <button onClick={() => setShowManualModel(false)} className="btn btn-sm btn-ghost">取消</button>
                                    </div>
                                )}
                                {modelsInfo.status && <div style={{ fontSize: '12px', marginTop: '8px', color: modelsInfo.error ? '#ff6b6b' : '#00B894' }}>{modelsInfo.status}</div>}
                            </div>
                        </div>

                        <div className="glass-card">
                            <div className="card-row" style={{ alignItems: 'center' }}>
                                <div className="card-info">
                                    <div className="card-icon-wrap">
                                        <MaterialSymbolIcon name="speed" />
                                    </div>
                                    <div>
                                        <h3 className="card-title">{t('testTitle') || "连接测试"}</h3>
                                        <p className="card-desc">{t('testDesc') || "验证API正常工作"}</p>
                                    </div>
                                </div>
                                <button type="button" onClick={testConnection} disabled={testResult?.isTesting} className="btn btn-accent" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <MaterialSymbolIcon name="bolt" style={{ fontSize: '16px' }} />
                                    <span>{t('testBtn')}</span>
                                </button>
                            </div>
                            {testResult && (
                                <div style={{ marginTop: '16px', fontSize: '13px', padding: '10px 14px', borderRadius: '8px', background: testResult.isError ? 'rgba(255,107,107,0.1)' : 'rgba(0,184,148,0.1)', color: testResult.isError ? '#ff6b6b' : '#00B894' }}>
                                    {testResult.msg}
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Interface Tab */}
                <section className={`tab-panel ${tab === 'interface' ? 'active' : ''}`}>
                    <header className="panel-header">
                        <h2 className="panel-title">{t('interfaceTitle')}</h2>
                        <p className="panel-desc">{t('interfaceDesc')}</p>
                    </header>
                    <div className="panel-body">
                        <div className="interface-layout">
                            <div className="interface-settings">
                                <div className="glass-card">
                                    <div className="card-section-title">
                                        <MaterialSymbolIcon name="dark_mode" />
                                        <span>{t('themeTitle')}</span>
                                    </div>
                                    <div className="radio-group">
                                        {[
                                            { id: 'dark', icon: 'dark_mode', label: t('themeDark') },
                                            { id: 'light', icon: 'light_mode', label: t('themeLight') },
                                            { id: 'auto', icon: 'contrast', label: t('themeAuto') }
                                        ].map(th => (
                                            <label key={th.id} className="radio-card">
                                                <input type="radio" name="theme" checked={settings.theme === th.id} onChange={() => updateSetting('theme', th.id as any)} />
                                                <span className="radio-card-label">
                                                    <MaterialSymbolIcon name={th.icon} />
                                                    <span>{th.label}</span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="glass-card">
                                    <div className="card-section-title">
                                        <MaterialSymbolIcon name="colorize" />
                                        <span>{t('accentTitle')}</span>
                                    </div>
                                    <div className="color-picker-row">
                                        <input type="color" value={settings.accentColor} onChange={e => updateSetting('accentColor', e.target.value)} className="color-native" />
                                        <div className="color-presets">
                                            {['#6C5CE7', '#0984E3', '#00B894', '#E17055', '#FD79A8', '#00e5ff'].map(c => (
                                                <button key={c} onClick={() => updateSetting('accentColor', c)} className="color-swatch" style={{ background: c }}></button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="glass-card">
                                    <div className="card-section-title">
                                        <MaterialSymbolIcon name="pip" />
                                        <span>{t('positionTitle') || "悬浮球位置"}</span>
                                    </div>
                                    <div className="radio-group radio-group-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <label className="radio-card">
                                            <input type="radio" name="position" checked={settings.position === 'top-left'} onChange={() => updateSetting('position', 'top-left')} />
                                            <span className="radio-card-label">{t('posTopLeft') || "↖ 左上"}</span>
                                        </label>
                                        <label className="radio-card">
                                            <input type="radio" name="position" checked={settings.position === 'top-right'} onChange={() => updateSetting('position', 'top-right')} />
                                            <span className="radio-card-label">{t('posTopRight') || "↗ 右上"}</span>
                                        </label>
                                        <label className="radio-card">
                                            <input type="radio" name="position" checked={settings.position === 'bottom-left'} onChange={() => updateSetting('position', 'bottom-left')} />
                                            <span className="radio-card-label">{t('posBotLeft') || "↙ 左下"}</span>
                                        </label>
                                        <label className="radio-card">
                                            <input type="radio" name="position" checked={settings.position === 'bottom-right'} onChange={() => updateSetting('position', 'bottom-right')} />
                                            <span className="radio-card-label">{t('posBotRight') || "↘ 右下"}</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="interface-preview">
                                <div className="preview-header">
                                    <MaterialSymbolIcon name="visibility" />
                                    <span>{t('previewTitle') || "实时预览"}</span>
                                </div>
                                <div className="mock-chat-panel">
                                    <div className="mock-panel-header">
                                        <div className="mock-header-left">
                                            <MaterialSymbolIcon name="chat" />
                                            <span>AI Assistant</span>
                                        </div>
                                    </div>
                                    <div className="mock-panel-body">
                                        <div className="mock-message mock-msg-assistant">
                                            <div className="mock-msg-bubble">Hello! I can help you do something. You can try the following skills:</div>
                                        </div>
                                        <div className="mock-message mock-msg-user">
                                            <div className="mock-msg-bubble">Summarize the core content of the current web page.</div>
                                        </div>
                                        <div className="mock-message mock-msg-assistant">
                                            <div className="mock-msg-bubble mock-msg-actions">
                                                <div className="mock-action-chip"><MaterialSymbolIcon name="summarize" /> summarize</div>
                                                <div className="mock-action-chip"><MaterialSymbolIcon name="translate" /> translate</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mock-panel-footer">
                                        <div className="mock-input">Type your message...</div>
                                        <button className="mock-send-btn"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Security Tab */}
                <section className={`tab-panel ${tab === 'security' ? 'active' : ''}`}>
                    <header className="panel-header">
                        <h2 className="panel-title">{t('securityTitle')}</h2>
                        <p className="panel-desc">{t('securityDesc')}</p>
                    </header>
                    <div className="panel-body">
                        <div className="glass-card">
                            <div className="card-section-title">
                                <MaterialSymbolIcon name="database" />
                                <span>{t('dataStorageTitle')}</span>
                            </div>

                            
                        <div className="card-row" style={{ marginTop: '16px' }}>
                            <div className="card-info">
                                <div>
                                    <h3 className="card-title">{t('encryptTitle') || "本地存储加密"}</h3>
                                    <p className="card-desc">{t('encryptDesc') || "对本地保存的聊天记录和设置进行加密。"}</p>
                                </div>
                            </div>
                            <label className="toggle">
                                <input type="checkbox" checked={settings.encryptLocal} onChange={e => updateSetting('encryptLocal', e.target.checked)} />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>

                        <div className="divider"></div>

                        <div className="card-row">
                            <div className="card-info">
                                <div>
                                    <h3 className="card-title">{t('autoClearTitle') || "自动清除聊天记录"}</h3>
                                    <p className="card-desc">{t('autoClearDesc') || "关闭浏览器时自动清除所有会话数据。"}</p>
                                </div>
                            </div>
                            <label className="toggle">
                                <input type="checkbox" checked={settings.autoClearChat} onChange={e => updateSetting('autoClearChat', e.target.checked)} />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div className="glass-card">
                        <div className="card-section-title">
                            <MaterialSymbolIcon name="verified_user" />
                            <span>{t('permissionTitle') || "权限控制"}</span>
                        </div>

                        <div className="card-row" style={{ marginTop: '16px' }}>
                            <div className="card-info">
                                <div>
                                    <h3 className="card-title">{t('confirmToolTitle') || "工具调用确认"}</h3>
                                    <p className="card-desc">{t('confirmToolDesc') || "AI 调用页面工具前需要用户手动确认。"}</p>
                                </div>
                            </div>
                            <label className="toggle">
                                <input type="checkbox" checked={settings.confirmToolCall} onChange={e => updateSetting('confirmToolCall', e.target.checked)} />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>

                        <div className="divider"></div>

                        <div className="card-row">
                            <div className="card-info">
                                <div>
                                    <h3 className="card-title">{t('filterTitle') || "敏感数据过滤"}</h3>
                                    <p className="card-desc">{t('filterDesc') || "发送到 AI 前自动过滤页面中的敏感信息。"}</p>
                                </div>
                            </div>
                            <label className="toggle">
                                <input type="checkbox" checked={settings.filterSensitive} onChange={e => updateSetting('filterSensitive', e.target.checked)} />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>

                        </div>

                        <div className="glass-card">
                            <div className="card-row" style={{ alignItems: 'center' }}>
                                <div className="card-info">
                                    <div className="card-icon-wrap danger">
                                        <MaterialSymbolIcon name="delete_forever" />
                                    </div>
                                    <div>
                                        <h3 className="card-title">{t('clearAllTitle')}</h3>
                                        <p className="card-desc">{t('clearAllDesc')}</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => {
                                    if (confirm(t('toastClearConfirm'))) {
                                        chrome.storage.local.clear(() => {
                                            setSettings(DEFAULT_SETTINGS);
                                            setSavedSettings(DEFAULT_SETTINGS);
                                            showToast(t('toastCleared'));
                                        });
                                    }
                                }} className="btn btn-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <MaterialSymbolIcon name="delete" style={{ fontSize: '16px' }} />
                                    <span>{t('clearAllBtn')}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Remote Services Tab */}
                <section className={`tab-panel ${tab === 'remote' ? 'active' : ''}`}>
                    <header className="panel-header">
                        <h2 className="panel-title">{t('remoteServicesTitle') || 'MCP/Skills'}</h2>
                        <p className="panel-desc">{t('remoteServicesDesc') || '管理 MCP/Skills 仓库，支持创建与编辑。'}</p>
                    </header>
                    <div className="panel-body">
                        <div className="glass-card">
                            <div className="card-row">
                                <div className="card-info">
                                    <div className="card-icon-wrap">
                                        <MaterialSymbolIcon name="cloud_download" />
                                    </div>
                                    <div>
                                        <h3 className="card-title">{t('remoteLoadingSwitchTitle') || '启用远程加载'}</h3>
                                        <p className="card-desc">{t('remoteLoadingSwitchDesc') || '在页面中按需加载已安装仓库的远程 MCP/Skills。'}</p>
                                    </div>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.remoteLoadingEnabled}
                                        onChange={e => updateSetting('remoteLoadingEnabled', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </div>

                        <div className="glass-card">
                            <div className="card-section-title">
                                <MaterialSymbolIcon name="speed" />
                                <span>{t('remoteToolTimeoutTitle') || '工具调用超时与重试'}</span>
                            </div>
                            <p className="card-desc" style={{ marginTop: '10px', marginBottom: '12px' }}>
                                {t('remoteToolTimeoutDesc') || '仅作用于远程工具调用，不影响模型请求。'}
                            </p>

                            <div className="form-group">
                                <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                    {t('remoteToolTimeoutSecondsLabel') || '超时时间（秒）'}
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className="glass-input"
                                    value={settings.remoteToolTimeoutSeconds}
                                    onChange={(e) => updateRemoteToolTimeoutSeconds(e.target.value)}
                                />
                            </div>

                            <div className="card-row" style={{ marginTop: '16px' }}>
                                <div className="card-info">
                                    <div>
                                        <h3 className="card-title">{t('remoteToolRetryEnabledTitle') || '启用超时重试'}</h3>
                                        <p className="card-desc">{t('remoteToolRetryEnabledDesc') || '仅当工具调用超时时自动重试。'}</p>
                                    </div>
                                </div>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.remoteToolRetryEnabled}
                                        onChange={(e) => updateSetting('remoteToolRetryEnabled', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>

                            {settings.remoteToolRetryEnabled && (
                                <div className="form-group" style={{ marginTop: '16px' }}>
                                    <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                        {t('remoteToolMaxRetriesLabel') || '最大重试次数'}
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        className="glass-input"
                                        value={settings.remoteToolMaxRetries}
                                        onChange={(e) => updateRemoteToolMaxRetries(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="glass-card">
                            <div className="card-section-title">
                                <MaterialSymbolIcon name="shield_lock" />
                                <span>{t('marketWhitelistTitle') || '市场源白名单'}</span>
                            </div>
                            <p className="card-desc" style={{ marginTop: '10px', marginBottom: '12px' }}>
                                {t('marketWhitelistDesc') || '仅允许这些市场域名触发安装写入。'}
                            </p>

                            {settings.allowedMarketOrigins.length === 0 && (
                                <div style={{ fontSize: '13px', fontStyle: 'italic', color: '#888', marginBottom: '8px' }}>
                                    {t('marketWhitelistEmpty') || '暂无白名单来源'}
                                </div>
                            )}

                            <div className="site-list">
                                {settings.allowedMarketOrigins.map((origin) => (
                                    <div key={origin} className="site-item">
                                        <span className="site-hostname">{origin}</span>
                                        <button onClick={() => removeMarketOriginSetting(origin)} className="btn-site-remove" aria-label={`remove-${origin}`}>
                                            <span style={{ fontSize: '18px', lineHeight: 1, fontWeight: 700 }}>×</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="site-add-row" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                <input
                                    type="text"
                                    value={newMarketOrigin}
                                    onChange={(e) => setNewMarketOrigin(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addMarketOriginSetting()}
                                    placeholder={t('marketWhitelistPlaceholder') || '例如: http://localhost:5173'}
                                    className="glass-input"
                                    style={{ flex: 1 }}
                                />
                                <button type="button" onClick={addMarketOriginSetting} className="btn btn-sm btn-accent" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <MaterialSymbolIcon name="add" style={{ fontSize: '16px' }} />
                                    {t('addBtn')}
                                </button>
                            </div>
                        </div>

                        <div className="glass-card">
                            <div className="card-row">
                                <div className="card-info">
                                    <div className="card-icon-wrap">
                                        <MaterialSymbolIcon name="search" />
                                    </div>
                                    <div>
                                        <h3 className="card-title">{t('remoteSearchTitle') || '搜索 MCP/Skills 仓库'}</h3>
                                        <p className="card-desc">{t('remoteSearchDesc') || '按仓库名称或域名过滤'}</p>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                <button
                                    type="button"
                                    className="btn btn-accent"
                                    onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('options-mcp-skills.html') })}
                                >
                                    创建仓库
                                </button>
                            </div>
                            <input
                                type="text"
                                value={mcpSkillsQuery}
                                onChange={(e) => setMcpSkillsQuery(e.target.value)}
                                placeholder={t('remoteSearchPlaceholder') || '输入仓库名称或域名'}
                                className="glass-input"
                                style={{ marginTop: '12px', width: '100%' }}
                            />
                        </div>

                        {mcpSkillsLoading ? (
                            <div className="glass-card">
                                <p className="card-desc">{t('remoteLoading') || '加载中...'}</p>
                            </div>
                        ) : filteredMcpSkillsRepos.length === 0 ? (
                            <div className="glass-card">
                                <p className="card-desc">{t('remoteEmpty') || '暂无 MCP/Skills 仓库。请先创建。'}</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
                                {filteredMcpSkillsRepos.map((repo) => (
                                    <div key={repo.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div className="card-row" style={{ alignItems: 'flex-start' }}>
                                            <div className="card-info">
                                                <div className="card-icon-wrap">
                                                    <MaterialSymbolIcon name="deployed_code" />
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <h3 className="card-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {repo.repositoryName}
                                                    </h3>
                                                    <p className="card-desc" style={{ marginTop: '6px' }}>
                                                        <strong>{t('remoteDomain') || '域名'}:</strong> {repo.siteDomain}
                                                        <br />
                                                        <strong>{t('remoteVersion') || '版本'}:</strong> {repo.release}
                                                    </p>
                                                </div>
                                            </div>
                                            <label className="toggle" style={{ flexShrink: 0 }}>
                                                <input type="checkbox" checked={repo.enabled} onChange={(e) => toggleMcpSkillsRepo(repo.id, e.target.checked)} />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div className="card-row" style={{ marginTop: '16px', alignItems: 'center' }}>
                                            <div className="card-info" style={{ flex: 1 }}>
                                                <h3 className="card-title" style={{ fontSize: '13px', margin: 0 }}>
                                                    {t('remoteAllowDirectExecTitle') || '允许直接执行'}
                                                </h3>
                                            </div>
                                            <label className="toggle" style={{ transform: 'scale(0.8)', transformOrigin: 'right center', flexShrink: 0 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={repo.allowWithoutConfirm ?? false}
                                                    onChange={(e) => toggleRepoAllowWithoutConfirm(repo.id, e.target.checked)}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '20px', justifyContent: 'center' }}>
                                            <button
                                                className="btn btn-outline"
                                                type="button"
                                                onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL(`options-mcp-skills.html?id=${encodeURIComponent(repo.id)}`) })}
                                            >
                                                编辑
                                            </button>
                                            <button className="btn btn-danger" type="button" onClick={() => setConfirmDeleteRepo(repo)}>
                                                {t('remoteDelete') || '删除'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                {/* Other Tab */}
                <section className={`tab-panel ${tab === 'other' ? 'active' : ''}`}>
                    <header className="panel-header">
                        <h2 className="panel-title">{t('otherTitle') || "其他"}</h2>
                        <p className="panel-desc">{t('otherDesc') || "关于插件的其他信息与操作。"}</p>
                    </header>
                    <div className="panel-body">
                        {/* About */}
                        <div className="glass-card">
                            <div className="card-section-title">
                                <MaterialSymbolIcon name="info" />
                                <span>{t('aboutTitle') || "关于 Page MCP"}</span>
                            </div>
                            <div className="about-grid">
                                <div className="about-item">
                                    <span className="about-label">{t('aboutVersion') || "版本"}</span>
                                    <span className="about-value">1.0.0</span>
                                </div>
                                <div className="about-item">
                                    <span className="about-label">{t('aboutAuthor') || "作者"}</span>
                                    <span className="about-value">Page MCP Team</span>
                                </div>
                                <div className="about-item">
                                    <span className="about-label">{t('aboutLicense') || "许可"}</span>
                                    <span className="about-value">MIT License</span>
                                </div>
                                <div className="about-item">
                                    <span className="about-label">{t('aboutHomepage') || "主页"}</span>
                                    <a className="about-value about-link" href="https://page-mcp.org" target="_blank">page-mcp.org</a>
                                </div>
                            </div>
                        </div>

                        {/* Reset */}
                        <div className="glass-card">
                            <div className="card-row" style={{ alignItems: 'center' }}>
                                <div className="card-info">
                                    <div className="card-icon-wrap warning">
                                        <MaterialSymbolIcon name="restart_alt" />
                                    </div>
                                    <div>
                                        <h3 className="card-title">{t('resetTitle') || "恢复默认设置"}</h3>
                                        <p className="card-desc">{t('resetDesc') || "将所有设置恢复为出厂默认值。"}</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => {
                                    if (confirm(t('toastResetConfirm') || "确定要恢复默认设置吗？已添加的模型等数据将丢失。")) {
                                        chrome.storage.local.clear(() => {
                                            setSettings(DEFAULT_SETTINGS);
                                            setSavedSettings(DEFAULT_SETTINGS);
                                            showToast(t('toastReset') || "设置已重置");
                                        });
                                    }
                                }} className="btn btn-outline">
                                    {t('resetBtn') || "恢复默认"}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

            
            {confirmDeleteRepo && (
                <div className="confirm-modal-backdrop" onClick={() => setConfirmDeleteRepo(null)}>
                    <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-modal-title">{t('remoteDeleteDialogTitle') || '删除远程仓库'}</div>
                        <div className="confirm-modal-desc">
                            {(t('remoteDeleteDialogDesc') || '确认删除仓库 {name} 吗？').replace('{name}', confirmDeleteRepo.repositoryName)}
                        </div>
                        <div className="confirm-modal-actions">
                            <button className="btn btn-ghost" type="button" onClick={() => setConfirmDeleteRepo(null)}>
                                {t('remoteDeleteCancel') || '取消'}
                            </button>
                            <button
                                className="btn btn-danger"
                                type="button"
                                onClick={async () => {
                                    const repoId = confirmDeleteRepo.id;
                                    setConfirmDeleteRepo(null);
                                    await deleteMcpSkillsRepo(repoId);
                                }}
                            >
                                {t('remoteDeleteConfirmBtn') || '确认删除'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Action Bar */}
            <div className={`action-bar ${dirty ? 'show' : ''}`}>
                <div className="action-bar-inner">
                    <span className="action-bar-text">{t('actionBarText') || "设置已修改"}</span>
                    <div className="action-bar-buttons">
                        <button type="button" className="btn btn-ghost" onClick={discardChanges}>{t('discardBtn') || "放弃"}</button>
                        <button type="button" className="btn btn-primary" onClick={saveSettings}>{t('saveBtn') || "保存"}</button>
                    </div>
                </div>
            </div>

            </main>
        </div>
    );
};

const root = createRoot(document.getElementById('app') as HTMLElement);
root.render(<OptionsApp />);

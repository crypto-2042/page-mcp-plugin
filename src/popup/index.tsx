import React, { useEffect, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Settings, Search, MessageSquare, Terminal, FileText, Blocks, Expand, Shrink, X } from 'lucide-react';
import './input.css';
import { loadSettingsAndLocale } from '../shared/locale-loader.js';
import { getSourceBadgeKind, getSourceBadgeText } from './popup-source.js';

// Using chrome.i18n for localization
interface Item {
    name?: string;
    title?: string;
    description?: string;
    prompt?: string;
    sourceType?: 'native' | 'remote';
    sourceLabel?: string;
    sourceRepositoryId?: string;
}

interface MCPData {
    tools: Item[];
    prompts: Item[];
    resources: Item[];
    skills: Item[];
}

interface LocaleEntry {
    message: string;
    placeholders?: Record<string, { content?: string }>;
}

const App: React.FC = () => {
    const [settings, setSettings] = useState<any>(null);
    const [tab, setTab] = useState<'mcp' | 'skills'>('mcp');
    const [searchQuery, setSearchQuery] = useState('');
    const [data, setData] = useState<MCPData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const [dict, setDict] = useState<Record<string, LocaleEntry>>({});
    const [localeReady, setLocaleReady] = useState(false);

    const t = (key: string, subs?: Record<string, string> | string[] | string | number) => {
        const entry = dict[key];
        let msg = entry?.message || key;

        if (Array.isArray(subs)) {
            const placeholders = entry?.placeholders || {};
            Object.entries(placeholders).forEach(([name, def]) => {
                const raw = def?.content || '';
                const index = Number(raw.replace(/\$/g, '')) - 1;
                if (Number.isInteger(index) && index >= 0 && index < subs.length) {
                    msg = msg.replace(new RegExp(`\\$${name}\\$`, 'g'), String(subs[index]));
                }
            });
            subs.forEach((value, i) => {
                const index = i + 1;
                msg = msg.replace(new RegExp(`\\$${index}`, 'g'), String(value));
                msg = msg.replace(new RegExp(`\\{${index}\\}`, 'g'), String(value));
            });
            return msg;
        }

        if (subs && typeof subs === 'object') {
            Object.entries(subs).forEach(([k, v]) => {
                msg = msg.replace('{' + k + '}', String(v));
                msg = msg.replace(new RegExp(`\\$${k}\\$`, 'g'), String(v));
            });
        }
        return msg;
    };



    useEffect(() => {
        let mounted = true;
        const fetchSettings = async () => {
            try {
                const { settings, dict } = await loadSettingsAndLocale();
                if (!mounted) return;
                setSettings(settings);
                setDict(dict);
                setLocaleReady(true);
                if (settings) {
                    const { theme, accentColor } = settings;
                    const root = document.documentElement;
                    if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                        root.classList.add('dark');
                    } else {
                        root.classList.remove('dark');
                    }
                    if (accentColor) {
                        root.style.setProperty('--color-primary', accentColor);
                    }
                }
            } catch (err) {
                console.error('Failed to get settings:', err);
                if (mounted) setLocaleReady(true);
            }
        };

        const fetchData = async () => {
            try {
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!activeTab || !activeTab.id || activeTab.url?.startsWith('chrome://') || activeTab.url?.startsWith('chrome-extension://')) {
                    setError('noActiveTab');
                    return;
                }
                const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'QUERY_PAGE_MCP_CAPABILITIES' });
                if (response && response.ok) {
                    setData(response.data);
                } else {
                    setError('noPageMcp');
                }
            } catch (e) {
                setError('noConnection');
            }
        };

        fetchSettings();
        fetchData();

        return () => {
            mounted = false;
        };
    }, []);

    const toggleExpand = (section: string) => {
        setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const renderSection = (titleKey: string, items: Item[], icon: React.ReactNode, id: string, twoCols = false) => {
        const q = searchQuery.toLowerCase();
        const filtered = items.filter(item =>
            (item.name || '').toLowerCase().includes(q) ||
            (item.title || '').toLowerCase().includes(q) ||
            (item.description || '').toLowerCase().includes(q)
        );

        if (filtered.length === 0 && q) return null;

        const isExpanded = expanded[id] || !!q;
        const displayItems = isExpanded ? filtered : filtered.slice(0, 2);

        return (
            <section className={`mt-${id === 'prompts' || id === 'skills' ? '2' : '6'}`}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                        {icon}
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{t(titleKey)}</h3>
                        {items.length > 0 && <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-500">{items.length}</span>}
                    </div>
                </div>

                {error ? (
                    <div className="text-xs text-slate-500 italic p-2 text-center">{t(error)}</div>
                ) : !data ? (
                    <div className="text-xs text-slate-500 italic p-2 text-center loader">Loading...</div>
                ) : filtered.length === 0 ? (
                    <div className="text-xs text-slate-500 italic p-2 text-center">{t('noItems')}</div>
                ) : (
                    // <div className={`${twoCols ? 'grid grid-cols-2 gap-2' : 'space-y-2'}`}>
                    <div className="space-y-2">
                        {displayItems.map((item, i) => (
                            <div key={i} className="item-card p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-primary/5 transition-colors group">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${getSourceBadgeKind(item) === 'native'
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                        }`}>
                                        {getSourceBadgeText(item)}
                                    </span>
                                    <h4 className="item-title font-semibold text-sm group-hover:text-primary transition-colors truncate">
                                        {item.title || item.name}
                                    </h4>
                                </div>
                                {(item.description || (item.prompt ? 'Contains predefined prompt' : '')) && (
                                    <p className="item-desc text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                                        {item.description || (item.prompt ? 'Contains predefined prompt' : '')}
                                    </p>
                                )}
                            </div>
                        ))}

                        {!q && filtered.length > 2 && (
                            <div className={`flex justify-center mt-2 pb-1 ${twoCols ? 'col-span-2' : ''}`}>
                                <button
                                    onClick={() => toggleExpand(id)}
                                    className="text-[11px] font-medium text-slate-500 hover:text-primary transition-colors cursor-pointer py-1.5 px-4 rounded-full bg-slate-100 dark:bg-slate-800/50 hover:bg-primary/10 flex items-center gap-1"
                                >
                                    {isExpanded ? (
                                        <>{t('viewLess')} <Shrink size={12} /></>
                                    ) : (
                                        <>{t('viewAll', [String(filtered.length)])} <Expand size={12} /></>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </section>
        );
    };

    if (!localeReady) {
        return <div className="view-panel" />;
    }

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            <header className="p-4 space-y-4 bg-background-light dark:bg-background-dark/80 sticky top-0 z-10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-0.5 rounded-lg">
                            <img src="../assets/icon-48.png" alt="Logo" className="w-7 h-7 rounded-lg shadow-sm" />
                        </div>
                        <h1 className="font-bold text-lg tracking-tight ml-1">{t('extensionName')}</h1>
                    </div>
                    <button
                        onClick={() => chrome.runtime.openOptionsPage()}
                        className="text-slate-500 hover:text-primary transition-colors cursor-pointer" title="Settings"
                    >
                        <Settings size={20} />
                    </button>
                </div>

                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                        <Search className="text-slate-500 dark:text-slate-300 group-focus-within:text-primary transition-colors block" size={18} />
                    </div>
                    <input
                        className="block w-full pl-10 pr-4 py-2.5 glass-effect rounded-xl border border-slate-200 dark:border-slate-800 focus:border-primary focus:ring-1 focus:ring-primary bg-white/5 text-sm transition-all text-slate-900 dark:text-slate-100 outline-none"
                        placeholder={t('searchPlaceholder')}
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        autoComplete="off" spellCheck="false"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            <X size={16} />
                        </button>
                    )}
                </div>

                <div className="flex p-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl">
                    <button
                        onClick={() => setTab('mcp')}
                        className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all ${tab === 'mcp' ? 'bg-white dark:bg-primary shadow-sm text-primary dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        MCP
                    </button>
                    <button
                        onClick={() => setTab('skills')}
                        className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all ${tab === 'skills' ? 'bg-white dark:bg-primary shadow-sm text-primary dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        {t('skills')}
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 focus:outline-none">
                {tab === 'mcp' && (
                    <div className="view-panel animate-in fade-in slide-in-from-bottom-2 duration-200">
                        {renderSection('prompts', data?.prompts || [], <MessageSquare className="text-emerald-500" size={16} />, 'prompts')}
                        {renderSection('tools', data?.tools || [], <Terminal className="text-primary" size={16} />, 'tools')}
                        {renderSection('resources', data?.resources || [], <FileText className="text-amber-500" size={16} />, 'resources', true)}
                    </div>
                )}

                {tab === 'skills' && (
                    <div className="view-panel animate-in fade-in slide-in-from-bottom-2 duration-200">
                        {renderSection('skills', data?.skills || [], <Blocks className="text-purple-500" size={16} />, 'skills')}
                    </div>
                )}
            </main>
        </div>
    );
};

// Render React App
const rootEl = document.getElementById('app');
if (rootEl) {
    const root = createRoot(rootEl);
    root.render(<App />);
}

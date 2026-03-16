import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { McpSkillsRepository, PluginSettings } from '../shared/types.js';
import { DEFAULT_SETTINGS } from '../shared/types.js';
import {
    buildRepositoryPayloadFromForm,
    getEmptyFormState,
    parseRepositoryToFormState,
    type McpSkillsFormState,
    type PromptForm,
    type SkillItemForm,
    type ToolForm,
    type ResourceForm,
} from './mcp-skills-form.js';
import './styles.css';

function newToolRow(): ToolForm {
    return {
        id: `tool_${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        description: '',
        path: '.*',
        execute: '',
        inputSchemaStr: '',
    };
}

function newPromptRow(): PromptForm {
    return {
        id: `prompt_${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        description: '',
        path: '.*',
        prompt: '',
        argumentsStr: '',
    };
}

function newResourceRow(): ResourceForm {
    return {
        id: `resource_${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        description: '',
        path: '.*',
        uri: 'page://selector/',
        mimeType: 'application/text',
    };
}

function newSkillRow(): SkillItemForm {
    return {
        id: `skill_${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        description: '',
        path: '.*',
        skillMd: '',
        run: '',
    };
}

function toolHasExtraContent(item: ToolForm): boolean {
    return !!(item.description.trim() || item.path.trim() || item.execute.trim());
}

function promptHasExtraContent(item: PromptForm): boolean {
    return !!(item.description.trim() || item.path.trim() || item.prompt.trim());
}

function resourceHasExtraContent(item: ResourceForm): boolean {
    return !!(item.description.trim() || item.path.trim() || item.uri.trim() || item.mimeType.trim());
}

function skillHasExtraContent(item: SkillItemForm): boolean {
    return !!(item.description.trim() || item.path.trim() || item.skillMd.trim() || item.run.trim());
}

// Modal component overlay
const ModalOverlay: React.FC<{ children: React.ReactNode; onClose: () => void }> = ({ children, onClose }) => (
    <div
        className="modal-overlay"
        style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'var(--dialog-overlay)',
            backdropFilter: 'blur(4px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
            padding: 20, boxSizing: 'border-box'
        }}
        onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}
    >
        <div className="glass-card modal-content" style={{ width: 640, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto' }}>
            {children}
        </div>
    </div>
);

const App: React.FC = () => {
    const editId = useMemo(() => new URLSearchParams(window.location.search).get('id') || '', []);
    const editing = !!editId;

    const [form, setForm] = useState<McpSkillsFormState>(getEmptyFormState());
    const [existingRepo, setExistingRepo] = useState<McpSkillsRepository | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [toolModalItem, setToolModalItem] = useState<ToolForm | null>(null);
    const [promptModalItem, setPromptModalItem] = useState<PromptForm | null>(null);
    const [resourceModalItem, setResourceModalItem] = useState<ResourceForm | null>(null);
    const [skillModalItem, setSkillModalItem] = useState<SkillItemForm | null>(null);

    const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
    const [dict, setDict] = useState<Record<string, { message: string }>>({});

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
        document.documentElement.style.setProperty('--s-accent', color);
    };

    useEffect(() => {
        try {
            chrome.storage.local.get('pageMcpSettings', (res) => {
                const mem = { ...DEFAULT_SETTINGS, ...(res.pageMcpSettings || {}) };
                setSettings(mem);
                applyTheme(mem.theme);
                applyAccent(mem.accentColor);
            });
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.pageMcpSettings) {
                    const mem = { ...DEFAULT_SETTINGS, ...(changes.pageMcpSettings.newValue || {}) };
                    setSettings(mem);
                    applyTheme(mem.theme);
                    applyAccent(mem.accentColor);
                }
            });
        } catch (e) { }
    }, []);

    useEffect(() => {
        const loadDict = async () => {
            try {
                const url = chrome.runtime.getURL('_locales/' + (settings?.language || 'zh') + '/messages.json');
                const res = await fetch(url);
                const data = await res.json();
                setDict(data);
            } catch (e) { }
        };
        loadDict();
    }, [settings?.language]);

    const t = (key: string, defaultText: string = '') => {
        let msg = dict[key]?.message;
        if (!msg) {
            try { msg = chrome.i18n.getMessage(key); } catch (e) { }
        }
        return msg || defaultText || key;
    };

    const showToast = (msg: string) => {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 2500);
    };

    useEffect(() => {
        if (!editing) return;
        const load = async () => {
            setLoading(true);
            try {
                const response = await chrome.runtime.sendMessage({ type: 'LIST_MCP_SKILLS_REPOS' });
                const items = (response?.items || []) as McpSkillsRepository[];
                const found = items.find((item) => item.id === editId);
                if (!found) {
                    setError('Repository not found.');
                    return;
                }
                setExistingRepo(found);
                setForm(parseRepositoryToFormState(found));
            } catch (e: any) {
                setError(e?.message || 'Failed to load repository.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [editing, editId]);

    const setField = <K extends keyof McpSkillsFormState>(key: K, value: McpSkillsFormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const validate = (): string | null => {
        if (!form.repositoryName.trim()) return 'Repository name is required.';
        if (!form.siteDomain.trim()) return 'Site domain is required.';

        for (const item of form.tools) {
            if (!item.name.trim() && toolHasExtraContent(item)) {
                return 'Each tool with content must have a name.';
            }
        }
        for (const item of form.prompts) {
            if (!item.name.trim() && promptHasExtraContent(item)) {
                return 'Each prompt with content must have a name.';
            }
        }
        for (const item of form.resources) {
            if (!item.name.trim() && resourceHasExtraContent(item)) {
                return 'Each resource with content must have a name.';
            }
        }

        for (const item of form.skills) {
            if (!item.name.trim() && skillHasExtraContent(item)) {
                return 'Each skill item with content must have a name.';
            }
        }

        return null;
    };

    const createUuid = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `repo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    };

    const save = async () => {
        const validateError = validate();
        if (validateError) {
            setError(validateError);
            return;
        }

        setError('');
        setSaving(true);
        try {
            const payload = buildRepositoryPayloadFromForm(form, existingRepo, Date.now(), createUuid);
            await chrome.runtime.sendMessage({ type: 'UPSERT_MCP_SKILLS_REPO', repo: payload });
            showToast(editing ? 'Repository updated' : 'Repository created');
            setTimeout(() => window.location.assign(chrome.runtime.getURL('options.html')), 400);
        } catch (e: any) {
            setError(e?.message || 'Failed to save repository.');
        } finally {
            setSaving(false);
        }
    };

    const toolItems = form.tools.filter((item) => item.name || toolHasExtraContent(item));
    const promptItems = form.prompts.filter((item) => item.name || promptHasExtraContent(item));
    const resourceItems = form.resources.filter((item) => item.name || resourceHasExtraContent(item));
    const allSkillItems = form.skills.filter(item => item.name || skillHasExtraContent(item));

    const removeTool = (id: string) => {
        setField('tools', form.tools.filter(i => i.id !== id));
    };

    const removePrompt = (id: string) => {
        setField('prompts', form.prompts.filter(i => i.id !== id));
    };

    const removeResource = (id: string) => {
        setField('resources', form.resources.filter(i => i.id !== id));
    };

    const saveToolModal = () => {
        if (!toolModalItem) return;
        if (!toolModalItem.name.trim()) return alert('Name is required');
        
        if (toolModalItem.inputSchemaStr.trim()) {
            try {
                JSON.parse(toolModalItem.inputSchemaStr);
            } catch (e) {
                return alert('Input Schema must be valid JSON');
            }
        }

        const { id } = toolModalItem;
        const index = form.tools.findIndex(i => i.id === id);
        if (index >= 0) {
            const next = [...form.tools];
            next[index] = toolModalItem;
            setField('tools', next);
        } else {
            setField('tools', [...form.tools, toolModalItem]);
        }
        setToolModalItem(null);
    };

    const savePromptModal = () => {
        if (!promptModalItem) return;
        if (!promptModalItem.name.trim()) return alert('Name is required');
        
        if (promptModalItem.argumentsStr.trim()) {
            try {
                JSON.parse(promptModalItem.argumentsStr);
            } catch (e) {
                return alert('Arguments must be valid JSON');
            }
        }

        const { id } = promptModalItem;
        const index = form.prompts.findIndex(i => i.id === id);
        if (index >= 0) {
            const next = [...form.prompts];
            next[index] = promptModalItem;
            setField('prompts', next);
        } else {
            setField('prompts', [...form.prompts, promptModalItem]);
        }
        setPromptModalItem(null);
    };

    const saveResourceModal = () => {
        if (!resourceModalItem) return;
        if (!resourceModalItem.name.trim()) return alert('Name is required');

        const { id } = resourceModalItem;
        const index = form.resources.findIndex(i => i.id === id);
        if (index >= 0) {
            const next = [...form.resources];
            next[index] = resourceModalItem;
            setField('resources', next);
        } else {
            setField('resources', [...form.resources, resourceModalItem]);
        }
        setResourceModalItem(null);
    };

    const removeSkill = (id: string) => {
        setField('skills', form.skills.filter(i => i.id !== id));
    };

    const saveSkillModal = () => {
        if (!skillModalItem) return;
        if (!skillModalItem.name.trim()) return alert('Name is required');

        const { id } = skillModalItem;
        const index = form.skills.findIndex(i => i.id === id);
        if (index >= 0) {
            const next = [...form.skills];
            next[index] = skillModalItem;
            setField('skills', next);
        } else {
            setField('skills', [...form.skills, skillModalItem]);
        }
        setSkillModalItem(null);
    };

    return (
        <div className="settings-shell" style={{ minHeight: '100vh' }}>
            <main className="main-content" style={{ width: '100%', marginLeft: 0, padding: '32px', maxWidth: 980, margin: '0 auto' }}>
                <header className="panel-header">
                    <h2 className="panel-title">{editing ? t('editRepoTitle', 'Edit MCP/Skills Repository') : t('createRepoTitle', 'Create MCP/Skills Repository')}</h2>
                    <p className="panel-desc">{t('repoLocalModeDesc', 'Local repository mode: repository id/version are generated automatically.')}</p>
                </header>

                {error && (
                    <div className="glass-card" style={{ borderColor: '#ef4444' }}>
                        <p className="card-desc" style={{ color: '#ef4444' }}>{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="glass-card"><p className="card-desc">Loading...</p></div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* Repository Form */}
                        <div className="glass-card">
                            <div className="card-section-title"><span className="material-symbols-outlined">badge</span><span>{t('repositoryTitle', 'Repository')}</span></div>
                            <div style={{ display: 'grid', gap: 16, marginTop: 12 }}>
                                <div className="form-group">
                                    <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('repoNameLabel', 'Repository Name')}</label>
                                    <input className="glass-input" placeholder={t('repoNamePlaceholder', 'Enter repository name')} value={form.repositoryName} onChange={(e) => setField('repositoryName', e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('repoDescLabel', 'Description (Optional)')}</label>
                                    <input className="glass-input" placeholder={t('repoDescPlaceholder', 'Enter rough description')} value={form.repositoryDescription || ''} onChange={(e) => setField('repositoryDescription', e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('repoSiteDomainLabel', 'Site Domain')}</label>
                                    <input className="glass-input" placeholder="e.g. example.com" value={form.siteDomain} onChange={(e) => setField('siteDomain', e.target.value)} />
                                </div>
                            </div>
                        </div>

                        {/* Tools */}
                        <div className="glass-card">
                            <div className="card-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="material-symbols-outlined">build</span><span>Tools</span>
                                </div>
                                <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setToolModalItem(newToolRow())}>+ Add tool</button>
                            </div>
                            {toolItems.length === 0 ? (
                                <p className="card-desc" style={{ marginTop: 12 }}>No tools yet.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                                    {toolItems.map((item) => (
                                        <div key={item.id} className="list-item-card" onClick={() => setToolModalItem({ ...item })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid var(--s-border)', borderRadius: 8, background: 'var(--s-glass-card)', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <strong style={{ color: 'var(--s-text)' }}>{item.name || '(unnamed)'}</strong>
                                                </div>
                                                <div style={{ fontSize: 13, color: 'var(--s-text-secondary)', marginTop: 4 }}>{item.description || t('noDesc', 'No description')}</div>
                                            </div>
                                            <span className="material-symbols-outlined" style={{ color: 'var(--s-text-muted)' }}>chevron_right</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Prompts */}
                        <div className="glass-card" style={{ marginTop: 24 }}>
                            <div className="card-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="material-symbols-outlined">chat</span><span>Prompts</span>
                                </div>
                                <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setPromptModalItem(newPromptRow())}>+ Add prompt</button>
                            </div>
                            {promptItems.length === 0 ? (
                                <p className="card-desc" style={{ marginTop: 12 }}>No prompts yet.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                                    {promptItems.map((item) => (
                                        <div key={item.id} className="list-item-card" onClick={() => setPromptModalItem({ ...item })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid var(--s-border)', borderRadius: 8, background: 'var(--s-glass-card)', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <strong style={{ color: 'var(--s-text)' }}>{item.name || '(unnamed)'}</strong>
                                                </div>
                                                <div style={{ fontSize: 13, color: 'var(--s-text-secondary)', marginTop: 4 }}>{item.description || t('noDesc', 'No description')}</div>
                                            </div>
                                            <span className="material-symbols-outlined" style={{ color: 'var(--s-text-muted)' }}>chevron_right</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Resources */}
                        <div className="glass-card" style={{ marginTop: 24 }}>
                            <div className="card-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="material-symbols-outlined">inventory_2</span><span>Resources</span>
                                </div>
                                <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setResourceModalItem(newResourceRow())}>+ Add resource</button>
                            </div>
                            {resourceItems.length === 0 ? (
                                <p className="card-desc" style={{ marginTop: 12 }}>No resources yet.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                                    {resourceItems.map((item) => (
                                        <div key={item.id} className="list-item-card" onClick={() => setResourceModalItem({ ...item })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid var(--s-border)', borderRadius: 8, background: 'var(--s-glass-card)', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <strong style={{ color: 'var(--s-text)' }}>{item.name || '(unnamed)'}</strong>
                                                </div>
                                                <div style={{ fontSize: 13, color: 'var(--s-text-secondary)', marginTop: 4 }}>{item.description || t('noDesc', 'No description')}</div>
                                            </div>
                                            <span className="material-symbols-outlined" style={{ color: 'var(--s-text-muted)' }}>chevron_right</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Skills List */}
                        <div className="glass-card">
                            <div className="card-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="material-symbols-outlined">terminal</span><span>{t('skillsTitle', 'Skills')}</span>
                                </div>
                                <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setSkillModalItem(newSkillRow())}>+ {t('addSkillBtn', 'Add Skill')}</button>
                            </div>
                            {allSkillItems.length === 0 ? (
                                <p className="card-desc" style={{ marginTop: 12 }}>{t('noSkills', 'No skills yet.')}</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                                    {allSkillItems.map((item, idx) => (
                                        <div key={item.id} className="list-item-card" onClick={() => setSkillModalItem({ ...item })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid var(--s-border)', borderRadius: 8, background: 'var(--s-glass-card)', cursor: 'pointer', transition: 'all 0.2s ease', borderBottom: idx !== allSkillItems.length - 1 ? '1px solid var(--s-border)' : '1px solid var(--s-border)' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <strong style={{ color: 'var(--s-text)' }}>{item.name || '(unnamed)'}</strong>
                                                    <span style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, background: 'var(--s-success-bg)', color: 'var(--s-success)', border: '1px solid var(--s-border-light)' }}>SKILL</span>
                                                </div>
                                                <div style={{ fontSize: 13, color: 'var(--s-text-secondary)', marginTop: 4 }}>{item.description || t('noDesc', 'No description')}</div>
                                            </div>
                                            <span className="material-symbols-outlined" style={{ color: 'var(--s-text-muted)' }}>chevron_right</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="glass-card" style={{ marginTop: 24 }}>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                <button className="btn btn-ghost" type="button" onClick={() => window.location.assign(chrome.runtime.getURL('options.html'))}>{t('cancelBtn', 'Cancel')}</button>
                                <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>{saving ? t('savingBtn', 'Saving...') : t('saveRepoBtn', 'Save Repository')}</button>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Tool Modal */}
            {toolModalItem && (
                <ModalOverlay onClose={() => setToolModalItem(null)}>
                    <h3 style={{ margin: '0 0 16px', color: 'var(--text-color)' }}>{toolModalItem.name ? 'Edit Tool' : 'New Tool'}</h3>
                    <div style={{ display: 'grid', gap: 12 }}>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                            <input className="glass-input" placeholder="e.g. read_file" value={toolModalItem.name} onChange={(e) => setToolModalItem({ ...toolModalItem, name: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Description</label>
                            <input className="glass-input" placeholder="What does this do?" value={toolModalItem.description} onChange={(e) => setToolModalItem({ ...toolModalItem, description: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Path Pattern (RegExp)</label>
                            <input className="glass-input" placeholder="default: .*" value={toolModalItem.path} onChange={(e) => setToolModalItem({ ...toolModalItem, path: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Execute Script (JS)</label>
                            <textarea className="glass-input" placeholder="() => { ... }" value={toolModalItem.execute} onChange={(e) => setToolModalItem({ ...toolModalItem, execute: e.target.value })} style={{ minHeight: 120, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Input Schema (JSON)</label>
                            <textarea className="glass-input" placeholder='{"type": "object", "properties": {}}' value={toolModalItem.inputSchemaStr} onChange={(e) => setToolModalItem({ ...toolModalItem, inputSchemaStr: e.target.value })} style={{ minHeight: 80, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                            {editing && toolModalItem.id && form.tools.some(i => i.id === toolModalItem.id) ? (
                                <button className="btn btn-danger" onClick={() => { removeTool(toolModalItem.id); setToolModalItem(null); }}>{t('deleteBtn', 'Delete')}</button>
                            ) : <div />}
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className="btn btn-ghost" onClick={() => setToolModalItem(null)}>{t('cancelBtn', 'Cancel')}</button>
                                <button className="btn btn-primary" onClick={saveToolModal}>{t('confirmBtn', 'Confirm')}</button>
                            </div>
                        </div>
                    </div>
                </ModalOverlay>
            )}

            {/* Prompt Modal */}
            {promptModalItem && (
                <ModalOverlay onClose={() => setPromptModalItem(null)}>
                    <h3 style={{ margin: '0 0 16px', color: 'var(--text-color)' }}>{promptModalItem.name ? 'Edit Prompt' : 'New Prompt'}</h3>
                    <div style={{ display: 'grid', gap: 12 }}>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                            <input className="glass-input" placeholder="e.g. summarize_page" value={promptModalItem.name} onChange={(e) => setPromptModalItem({ ...promptModalItem, name: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Description</label>
                            <input className="glass-input" placeholder="What does this do?" value={promptModalItem.description} onChange={(e) => setPromptModalItem({ ...promptModalItem, description: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Path Pattern (RegExp)</label>
                            <input className="glass-input" placeholder="default: .*" value={promptModalItem.path} onChange={(e) => setPromptModalItem({ ...promptModalItem, path: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Prompt Template</label>
                            <textarea className="glass-input" placeholder="Enter prompt text or template" value={promptModalItem.prompt} onChange={(e) => setPromptModalItem({ ...promptModalItem, prompt: e.target.value })} style={{ minHeight: 100 }} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Arguments (JSON)</label>
                            <textarea className="glass-input" placeholder='[{"name": "arg1", "description": "some arg", "required": true}]' value={promptModalItem.argumentsStr} onChange={(e) => setPromptModalItem({ ...promptModalItem, argumentsStr: e.target.value })} style={{ minHeight: 80, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                            {editing && promptModalItem.id && form.prompts.some(i => i.id === promptModalItem.id) ? (
                                <button className="btn btn-danger" onClick={() => { removePrompt(promptModalItem.id); setPromptModalItem(null); }}>{t('deleteBtn', 'Delete')}</button>
                            ) : <div />}
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className="btn btn-ghost" onClick={() => setPromptModalItem(null)}>{t('cancelBtn', 'Cancel')}</button>
                                <button className="btn btn-primary" onClick={savePromptModal}>{t('confirmBtn', 'Confirm')}</button>
                            </div>
                        </div>
                    </div>
                </ModalOverlay>
            )}

            {/* Resource Modal */}
            {resourceModalItem && (
                <ModalOverlay onClose={() => setResourceModalItem(null)}>
                    <h3 style={{ margin: '0 0 16px', color: 'var(--text-color)' }}>{resourceModalItem.name ? 'Edit Resource' : 'New Resource'}</h3>
                    <div style={{ display: 'grid', gap: 12 }}>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                            <input className="glass-input" placeholder="e.g. page_title" value={resourceModalItem.name} onChange={(e) => setResourceModalItem({ ...resourceModalItem, name: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Description</label>
                            <input className="glass-input" placeholder="What does this do?" value={resourceModalItem.description} onChange={(e) => setResourceModalItem({ ...resourceModalItem, description: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Path Pattern (RegExp)</label>
                            <input className="glass-input" placeholder="default: .*" value={resourceModalItem.path} onChange={(e) => setResourceModalItem({ ...resourceModalItem, path: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>URI</label>
                            <input className="glass-input" placeholder="e.g. page://selector/#id or page://xpath/a" value={resourceModalItem.uri} onChange={(e) => setResourceModalItem({ ...resourceModalItem, uri: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>MIME Type</label>
                            <select
                                className="glass-input"
                                value={resourceModalItem.mimeType}
                                onChange={(e) => setResourceModalItem({ ...resourceModalItem, mimeType: e.target.value })}
                                style={{ appearance: 'none', cursor: 'pointer' }}
                            >
                                <option value="application/json">application/json</option>
                                <option value="application/text">application/text</option>
                                <option value="application/html">application/html</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                            {editing && resourceModalItem.id && form.resources.some(i => i.id === resourceModalItem.id) ? (
                                <button className="btn btn-danger" onClick={() => { removeResource(resourceModalItem.id); setResourceModalItem(null); }}>{t('deleteBtn', 'Delete')}</button>
                            ) : <div />}
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className="btn btn-ghost" onClick={() => setResourceModalItem(null)}>{t('cancelBtn', 'Cancel')}</button>
                                <button className="btn btn-primary" onClick={saveResourceModal}>{t('confirmBtn', 'Confirm')}</button>
                            </div>
                        </div>
                    </div>
                </ModalOverlay>
            )}

            {/* Skill Modal */}
            {skillModalItem && (
                <ModalOverlay onClose={() => setSkillModalItem(null)}>
                    <h3 style={{ margin: '0 0 16px', color: 'var(--text-color)' }}>{skillModalItem.name ? 'Edit Skill' : 'New Skill'}</h3>
                    <div style={{ display: 'grid', gap: 12 }}>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                            <input className="glass-input" placeholder="e.g. summarize_page" value={skillModalItem.name} onChange={(e) => setSkillModalItem({ ...skillModalItem, name: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Description</label>
                            <input className="glass-input" placeholder="What does this do?" value={skillModalItem.description} onChange={(e) => setSkillModalItem({ ...skillModalItem, description: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Path Pattern (RegExp)</label>
                            <input className="glass-input" placeholder="default: .*" value={skillModalItem.path} onChange={(e) => setSkillModalItem({ ...skillModalItem, path: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Skill Markdown</label>
                            <textarea className="glass-input" placeholder="# Skill Prompt\n..." value={skillModalItem.skillMd} onChange={(e) => setSkillModalItem({ ...skillModalItem, skillMd: e.target.value })} style={{ minHeight: 160 }} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Run Script (Optional JS)</label>
                            <textarea className="glass-input" placeholder="Hook script to run..." value={skillModalItem.run} onChange={(e) => setSkillModalItem({ ...skillModalItem, run: e.target.value })} style={{ minHeight: 120, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                            {editing && skillModalItem.id && form.skills.some(i => i.id === skillModalItem.id) ? (
                                <button className="btn btn-danger" onClick={() => { removeSkill(skillModalItem.id); setSkillModalItem(null); }}>{t('deleteBtn', 'Delete')}</button>
                            ) : <div />}
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className="btn btn-ghost" onClick={() => setSkillModalItem(null)}>{t('cancelBtn', 'Cancel')}</button>
                                <button className="btn btn-primary" onClick={saveSkillModal}>{t('confirmBtn', 'Confirm')}</button>
                            </div>
                        </div>
                    </div>
                </ModalOverlay>
            )}
        </div>
    );
};

const root = createRoot(document.getElementById('app') as HTMLElement);
root.render(<App />);

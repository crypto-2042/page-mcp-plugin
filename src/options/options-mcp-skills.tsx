import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { McpSkillsRepository, PluginSettings } from '../shared/types.js';
import { DEFAULT_SETTINGS } from '../shared/types.js';
import {
    buildRepositoryPayloadFromForm,
    getEmptyFormState,
    parseRepositoryToFormState,
    type McpItemForm,
    type McpKind,
    type McpSkillsFormState,
    type SkillItemForm,
} from './mcp-skills-form.js';
import './styles.css';

function newMcpRow(kind: McpKind): McpItemForm {
    return {
        id: `${kind}_${Math.random().toString(36).slice(2, 8)}`,
        kind,
        name: '',
        description: '',
        pathPattern: '.*',
        execute: '',
        prompt: '',
        content: '',
    };
}

function newSkillRow(): SkillItemForm {
    return {
        id: `skill_${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        description: '',
        pathPattern: '.*',
        skillMd: '',
        run: '',
    };
}

function rowHasExtraContent(item: McpItemForm): boolean {
    return !!(item.description.trim() || item.pathPattern.trim() || item.execute.trim() || item.prompt.trim() || item.content.trim());
}

function skillHasExtraContent(item: SkillItemForm): boolean {
    return !!(item.description.trim() || item.pathPattern.trim() || item.skillMd.trim() || item.run.trim());
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

    const [mcpModalItem, setMcpModalItem] = useState<McpItemForm | null>(null);
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

        for (const item of [...form.tools, ...form.prompts, ...form.resources]) {
            if (!item.name.trim() && rowHasExtraContent(item)) {
                return 'Each MCP item with content must have a name.';
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

    // Derived full list
    const allMcpItems = [...form.tools, ...form.prompts, ...form.resources].filter(item => item.name || rowHasExtraContent(item));
    const allSkillItems = form.skills.filter(item => item.name || skillHasExtraContent(item));

    const removeMcp = (id: string, kind: McpKind) => {
        const key = kind === 'tool' ? 'tools' : kind === 'prompt' ? 'prompts' : 'resources';
        setField(key, form[key].filter(i => i.id !== id));
    };

    const saveMcpModal = () => {
        if (!mcpModalItem) return;
        if (!mcpModalItem.name.trim()) return alert('Name is required');

        const { id, kind } = mcpModalItem;
        const key = kind === 'tool' ? 'tools' : kind === 'prompt' ? 'prompts' : 'resources';

        // Remove from all in case kind changed
        const nextTools = form.tools.filter(i => i.id !== id);
        const nextPrompts = form.prompts.filter(i => i.id !== id);
        const nextResources = form.resources.filter(i => i.id !== id);

        if (kind === 'tool') nextTools.push(mcpModalItem);
        if (kind === 'prompt') nextPrompts.push(mcpModalItem);
        if (kind === 'resource') nextResources.push(mcpModalItem);

        setForm(prev => ({ ...prev, tools: nextTools, prompts: nextPrompts, resources: nextResources }));
        setMcpModalItem(null);
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

                        {/* MCP Items List */}
                        <div className="glass-card">
                            <div className="card-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="material-symbols-outlined">construction</span><span>{t('mcpItemsTitle', 'MCP Items')}</span>
                                </div>
                                <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setMcpModalItem(newMcpRow('tool'))}>+ {t('addMcpBtn', 'Add MCP')}</button>
                            </div>
                            {allMcpItems.length === 0 ? (
                                <p className="card-desc" style={{ marginTop: 12 }}>{t('noMcpItems', 'No MCP items yet.')}</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                                    {allMcpItems.map((item, idx) => (
                                        <div key={item.id} className="list-item-card" onClick={() => setMcpModalItem({ ...item })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid var(--s-border)', borderRadius: 8, background: 'var(--s-glass-card)', cursor: 'pointer', transition: 'all 0.2s ease', borderBottom: idx !== allMcpItems.length - 1 ? '1px solid var(--s-border)' : '1px solid var(--s-border)' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <strong style={{ color: 'var(--s-text)' }}>{item.name || '(unnamed)'}</strong>
                                                    <span style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, background: 'var(--s-accent-bg)', color: 'var(--s-accent)', border: '1px solid var(--s-border-light)' }}>{item.kind.toUpperCase()}</span>
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

            {/* MCP Modal */}
            {mcpModalItem && (
                <ModalOverlay onClose={() => setMcpModalItem(null)}>
                    <h3 style={{ margin: '0 0 16px', color: 'var(--text-color)' }}>{mcpModalItem.name ? 'Edit MCP Item' : 'New MCP Item'}</h3>
                    <div style={{ display: 'grid', gap: 12 }}>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Type</label>
                            <select
                                className="glass-input"
                                value={mcpModalItem.kind}
                                onChange={(e) => setMcpModalItem({ ...mcpModalItem, kind: e.target.value as McpKind })}
                                style={{ appearance: 'none', cursor: 'pointer' }}
                            >
                                <option value="tool">Tool</option>
                                <option value="prompt">Prompt</option>
                                <option value="resource">Resource</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                            <input className="glass-input" placeholder="e.g. read_file" value={mcpModalItem.name} onChange={(e) => setMcpModalItem({ ...mcpModalItem, name: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Description</label>
                            <input className="glass-input" placeholder="What does this do?" value={mcpModalItem.description} onChange={(e) => setMcpModalItem({ ...mcpModalItem, description: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Path Pattern (RegExp)</label>
                            <input className="glass-input" placeholder="default: .*" value={mcpModalItem.pathPattern} onChange={(e) => setMcpModalItem({ ...mcpModalItem, pathPattern: e.target.value })} />
                        </div>

                        {mcpModalItem.kind === 'tool' && (
                            <div className="form-group">
                                <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Execute Script (JS)</label>
                                <textarea className="glass-input" placeholder="() => { ... }" value={mcpModalItem.execute} onChange={(e) => setMcpModalItem({ ...mcpModalItem, execute: e.target.value })} style={{ minHeight: 120, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                            </div>
                        )}
                        {mcpModalItem.kind === 'prompt' && (
                            <>
                                <div className="form-group">
                                    <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Prompt Template</label>
                                    <textarea className="glass-input" placeholder="Enter prompt text or template" value={mcpModalItem.prompt} onChange={(e) => setMcpModalItem({ ...mcpModalItem, prompt: e.target.value })} style={{ minHeight: 100 }} />
                                </div>
                                <div className="form-group">
                                    <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Execute Script (Optional JS)</label>
                                    <textarea className="glass-input" placeholder="Script to run before prompt" value={mcpModalItem.execute} onChange={(e) => setMcpModalItem({ ...mcpModalItem, execute: e.target.value })} style={{ minHeight: 100, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                                </div>
                            </>
                        )}
                        {mcpModalItem.kind === 'resource' && (
                            <>
                                <div className="form-group">
                                    <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Content Template</label>
                                    <textarea className="glass-input" placeholder="Content text or template" value={mcpModalItem.content} onChange={(e) => setMcpModalItem({ ...mcpModalItem, content: e.target.value })} style={{ minHeight: 100 }} />
                                </div>
                                <div className="form-group">
                                    <label className="input-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Execute Script (Optional JS)</label>
                                    <textarea className="glass-input" placeholder="Script to run to fetch content" value={mcpModalItem.execute} onChange={(e) => setMcpModalItem({ ...mcpModalItem, execute: e.target.value })} style={{ minHeight: 100, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                                </div>
                            </>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                            {editing && mcpModalItem.id && [...form.tools, ...form.prompts, ...form.resources].some(i => i.id === mcpModalItem.id) ? (
                                <button className="btn btn-danger" onClick={() => { removeMcp(mcpModalItem.id, mcpModalItem.kind); setMcpModalItem(null); }}>{t('deleteBtn', 'Delete')}</button>
                            ) : <div />}
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className="btn btn-ghost" onClick={() => setMcpModalItem(null)}>{t('cancelBtn', 'Cancel')}</button>
                                <button className="btn btn-primary" onClick={saveMcpModal}>{t('confirmBtn', 'Confirm')}</button>
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
                            <input className="glass-input" placeholder="default: .*" value={skillModalItem.pathPattern} onChange={(e) => setSkillModalItem({ ...skillModalItem, pathPattern: e.target.value })} />
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

import React, { useState } from 'react';

const SECTION_KEYS = [
  { key: 'model_summary', label: '3D Model Summary' },
  { key: 'drawing', label: 'Engineering Drawing' },
  { key: 'dfm', label: 'DFM Analysis' },
  { key: 'tolerance', label: 'Tolerance Analysis' },
  { key: 'cost', label: 'Cost Breakdown' },
  { key: 'bom', label: 'Bill of Materials' },
  { key: 'appendix', label: 'Appendix' },
];

const TITLE_FIELDS = ['part_name', 'drawing_number', 'revision', 'date', 'author', 'reviewer', 'approver'];
const ASSUMPTION_OPTS = ['process', 'material', 'batch_size', 'standard_version'];
const SIGNATURE_ROLES = ['author', 'reviewer', 'approver'];

const DEFAULT_TEMPLATE = {
  name: '',
  label: '',
  label_ko: '',
  description: '',
  language: 'ko',
  title_block: { show_logo: true, fields: ['part_name', 'date', 'author'] },
  revision_history: { enabled: false, max_rows: 10 },
  toc: { enabled: true },
  sections: {
    model_summary: { enabled: true, order: 1 },
    drawing: { enabled: true, order: 2 },
    dfm: { enabled: true, order: 3 },
    tolerance: { enabled: true, order: 4 },
    cost: { enabled: true, order: 5 },
    bom: { enabled: true, order: 6 },
    appendix: { enabled: false, order: 7 },
  },
  assumptions: { enabled: true, show: ['process', 'material', 'batch_size'] },
  standards: { enabled: true, tags: ['KS B 0401', 'KS B ISO 2768-1'] },
  disclaimer: { enabled: true, text: '' },
  signature: { enabled: true, roles: ['author', 'reviewer', 'approver'], show_date: true },
  style: {
    page_format: 'A4',
    orientation: 'landscape',
    header_color: '#2c3e50',
    accent_color: '#3498db',
    font: 'NanumGothic',
  },
};

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function mergeDefaults(tpl) {
  const base = deepClone(DEFAULT_TEMPLATE);
  if (!tpl || tpl._isNew) return base;
  // Merge keeping structure
  return {
    ...base,
    ...tpl,
    title_block: { ...base.title_block, ...(tpl.title_block || {}) },
    revision_history: { ...base.revision_history, ...(tpl.revision_history || {}) },
    toc: { ...base.toc, ...(tpl.toc || {}) },
    sections: { ...base.sections, ...(tpl.sections || {}) },
    assumptions: { ...base.assumptions, ...(tpl.assumptions || {}) },
    standards: { ...base.standards, ...(tpl.standards || {}) },
    disclaimer: { ...base.disclaimer, ...(tpl.disclaimer || {}) },
    signature: { ...base.signature, ...(tpl.signature || {}) },
    style: { ...base.style, ...(tpl.style || {}) },
  };
}

export default function TemplateEditorModal({ template, onSave, onDelete, onCancel }) {
  const isNew = !template || template._isNew;
  const [data, setData] = useState(() => mergeDefaults(template));
  const [tab, setTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [newTag, setNewTag] = useState('');

  const set = (path, value) => {
    setData(prev => {
      const next = deepClone(prev);
      const keys = path.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const toggleArrayItem = (path, item) => {
    setData(prev => {
      const next = deepClone(prev);
      const keys = path.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      const arr = obj[keys[keys.length - 1]] || [];
      const idx = arr.indexOf(item);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(item);
      obj[keys[keys.length - 1]] = arr;
      return next;
    });
  };

  const handleSave = async () => {
    if (!data.name) return;
    setSaving(true);
    try {
      await onSave({ ...data, _isNew: isNew });
    } finally {
      setSaving(false);
    }
  };

  const addStandardTag = () => {
    if (!newTag.trim()) return;
    const tags = [...(data.standards?.tags || [])];
    if (!tags.includes(newTag.trim())) tags.push(newTag.trim());
    set('standards.tags', tags);
    setNewTag('');
  };

  const removeTag = (tag) => {
    set('standards.tags', (data.standards?.tags || []).filter(t => t !== tag));
  };

  const TABS = [
    { id: 'general', label: 'General' },
    { id: 'sections', label: 'Sections' },
    { id: 'title', label: 'Title & Sign' },
    { id: 'standards', label: 'Standards' },
    { id: 'style', label: 'Style' },
  ];

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isNew ? 'New Template' : `Edit: ${data.name}`}</h2>
          <button className="btn-icon" onClick={onCancel}>&times;</button>
        </div>

        <div className="modal-tabs">
          {TABS.map(t => (
            <button key={t.id} className={`modal-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body" style={{ minHeight: '320px' }}>
          {/* General Tab */}
          {tab === 'general' && (
            <>
              <div className="form-group">
                <label>Template Name</label>
                <input type="text" value={data.name} onChange={e => set('name', e.target.value)} disabled={!isNew}
                  placeholder="my_template (alphanumeric, _, -)" />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Label (EN)</label>
                  <input type="text" value={data.label || ''} onChange={e => set('label', e.target.value)} placeholder="Customer Report" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Label (KO)</label>
                  <input type="text" value={data.label_ko || ''} onChange={e => set('label_ko', e.target.value)} placeholder="고객 보고서" />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea rows="2" value={data.description || ''} onChange={e => set('description', e.target.value)}
                  placeholder="Template description..." />
              </div>
              <div className="form-group">
                <label>Language</label>
                <select value={data.language || 'ko'} onChange={e => set('language', e.target.value)}>
                  <option value="ko">Korean</option>
                  <option value="en">English</option>
                </select>
              </div>
            </>
          )}

          {/* Sections Tab */}
          {tab === 'sections' && (
            <>
              <div className="form-group">
                <label>Sections (toggle & reorder)</label>
                <div className="section-editor">
                  {SECTION_KEYS.map(({ key, label }) => {
                    const sec = data.sections?.[key] || { enabled: false, order: 99 };
                    return (
                      <div key={key} className="section-row">
                        <input type="checkbox" checked={sec.enabled !== false}
                          onChange={() => set(`sections.${key}.enabled`, !sec.enabled)} />
                        <span className="section-label">{label}</span>
                        <input type="number" className="order-input" min="1" max="10"
                          value={sec.order || ''} onChange={e => set(`sections.${key}.order`, parseInt(e.target.value) || 1)} />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="form-row">
                <label className="checkbox-label">
                  <input type="checkbox" checked={data.toc?.enabled !== false}
                    onChange={() => set('toc.enabled', !data.toc?.enabled)} /> Table of Contents
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={data.revision_history?.enabled === true}
                    onChange={() => set('revision_history.enabled', !data.revision_history?.enabled)} /> Revision History
                </label>
              </div>
            </>
          )}

          {/* Title & Signature Tab */}
          {tab === 'title' && (
            <>
              <div className="form-group">
                <label>Title Block Fields</label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={data.title_block?.show_logo !== false}
                    onChange={() => set('title_block.show_logo', !data.title_block?.show_logo)} /> Show Logo
                </label>
                <div className="checkbox-grid">
                  {TITLE_FIELDS.map(f => (
                    <label key={f} className="checkbox-label">
                      <input type="checkbox" checked={(data.title_block?.fields || []).includes(f)}
                        onChange={() => toggleArrayItem('title_block.fields', f)} /> {f}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Signature</label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={data.signature?.enabled !== false}
                    onChange={() => set('signature.enabled', !data.signature?.enabled)} /> Enable Signatures
                </label>
                {data.signature?.enabled !== false && (
                  <>
                    <div className="checkbox-grid">
                      {SIGNATURE_ROLES.map(r => (
                        <label key={r} className="checkbox-label">
                          <input type="checkbox" checked={(data.signature?.roles || []).includes(r)}
                            onChange={() => toggleArrayItem('signature.roles', r)} /> {r}
                        </label>
                      ))}
                    </div>
                    <label className="checkbox-label">
                      <input type="checkbox" checked={data.signature?.show_date !== false}
                        onChange={() => set('signature.show_date', !data.signature?.show_date)} /> Show Date Field
                    </label>
                  </>
                )}
              </div>
            </>
          )}

          {/* Standards Tab */}
          {tab === 'standards' && (
            <>
              <div className="form-group">
                <label>Assumptions</label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={data.assumptions?.enabled !== false}
                    onChange={() => set('assumptions.enabled', !data.assumptions?.enabled)} /> Show Assumptions
                </label>
                {data.assumptions?.enabled !== false && (
                  <div className="checkbox-grid">
                    {ASSUMPTION_OPTS.map(a => (
                      <label key={a} className="checkbox-label">
                        <input type="checkbox" checked={(data.assumptions?.show || []).includes(a)}
                          onChange={() => toggleArrayItem('assumptions.show', a)} /> {a}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Standard References</label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={data.standards?.enabled !== false}
                    onChange={() => set('standards.enabled', !data.standards?.enabled)} /> Show Standards
                </label>
                {data.standards?.enabled !== false && (
                  <div className="tag-editor">
                    <div className="tag-list">
                      {(data.standards?.tags || []).map(tag => (
                        <span key={tag} className="tag">{tag} <button onClick={() => removeTag(tag)}>&times;</button></span>
                      ))}
                    </div>
                    <div className="tag-input-row">
                      <input type="text" value={newTag} onChange={e => setNewTag(e.target.value)}
                        placeholder="e.g. KS B 0401" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addStandardTag())} />
                      <button className="btn btn-secondary" onClick={addStandardTag}>Add</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Disclaimer</label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={data.disclaimer?.enabled !== false}
                    onChange={() => set('disclaimer.enabled', !data.disclaimer?.enabled)} /> Show Disclaimer
                </label>
                {data.disclaimer?.enabled !== false && (
                  <textarea rows="2" value={data.disclaimer?.text || ''} onChange={e => set('disclaimer.text', e.target.value)}
                    placeholder="Disclaimer text..." />
                )}
              </div>
            </>
          )}

          {/* Style Tab */}
          {tab === 'style' && (
            <>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Page Format</label>
                  <select value={data.style?.page_format || 'A4'} onChange={e => set('style.page_format', e.target.value)}>
                    <option value="A4">A4</option>
                    <option value="A3">A3</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Orientation</label>
                  <select value={data.style?.orientation || 'landscape'} onChange={e => set('style.orientation', e.target.value)}>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Header Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="color" value={data.style?.header_color || '#2c3e50'}
                      onChange={e => set('style.header_color', e.target.value)} />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{data.style?.header_color}</span>
                  </div>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Accent Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="color" value={data.style?.accent_color || '#3498db'}
                      onChange={e => set('style.accent_color', e.target.value)} />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{data.style?.accent_color}</span>
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>Font</label>
                <select value={data.style?.font || 'NanumGothic'} onChange={e => set('style.font', e.target.value)}>
                  <option value="NanumGothic">NanumGothic</option>
                  <option value="Noto Sans KR">Noto Sans KR</option>
                  <option value="sans-serif">sans-serif</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          {!isNew && onDelete && (
            <button className="btn btn-danger" onClick={() => onDelete(data.name)}
              style={{ marginRight: 'auto' }}>Delete</button>
          )}
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !data.name}>
            {saving ? 'Saving...' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

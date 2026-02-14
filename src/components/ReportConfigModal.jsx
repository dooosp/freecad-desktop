import React, { useState, useEffect } from 'react';

const DEFAULT_METADATA = {
  part_name: '',
  drawing_number: '',
  revision: 'A',
  date: new Date().toISOString().split('T')[0],
  author: '',
  reviewer: '',
  approver: '',
};

const DEFAULT_SECTIONS = {
  model: true,
  drawing: true,
  dfm: true,
  tolerance: true,
  cost: true,
  bom: true,
};

const DEFAULT_OPTIONS = {
  language: 'ko',
  disclaimer: true,
  signature: true,
};

export default function ReportConfigModal({ templates, onGenerate, onCancel, backend }) {
  const [selectedTemplate, setSelectedTemplate] = useState('_default');
  const [metadata, setMetadata] = useState(DEFAULT_METADATA);
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [loadedTemplates, setLoadedTemplates] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (backend?.getReportTemplates) {
      backend.getReportTemplates()
        .then(tpls => setLoadedTemplates(tpls || []))
        .catch(() => setLoadedTemplates([]));
    }
  }, [backend]);

  const updateMetadata = (key, value) => {
    setMetadata(prev => ({ ...prev, [key]: value }));
  };

  const toggleSection = (key) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateOption = (key, value) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleGenerate = () => {
    setLoading(true);
    const config = {
      templateName: selectedTemplate !== '_default' ? selectedTemplate : undefined,
      metadata,
      sections,
      options,
    };
    onGenerate(config);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configure Report</h2>
          <button className="btn-icon" onClick={onCancel}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Template Selection */}
          <div className="form-group">
            <label>Report Template</label>
            <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
              <option value="_default">Default</option>
              {loadedTemplates.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Metadata */}
          <div className="form-group">
            <label>Part Information</label>
            <div className="form-row">
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="Part Name"
                  value={metadata.part_name}
                  onChange={e => updateMetadata('part_name', e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="Drawing Number"
                  value={metadata.drawing_number}
                  onChange={e => updateMetadata('drawing_number', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Revision</label>
              <input
                type="text"
                value={metadata.revision}
                onChange={e => updateMetadata('revision', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={metadata.date}
                onChange={e => updateMetadata('date', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Signatures</label>
            <div className="form-row">
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="Author"
                  value={metadata.author}
                  onChange={e => updateMetadata('author', e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="Reviewer"
                  value={metadata.reviewer}
                  onChange={e => updateMetadata('reviewer', e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="Approver"
                  value={metadata.approver}
                  onChange={e => updateMetadata('approver', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section Toggles */}
          <div className="form-group">
            <label>Include Sections</label>
            <div className="section-toggles">
              <div className="section-toggle">
                <input
                  type="checkbox"
                  id="sec-model"
                  checked={sections.model}
                  onChange={() => toggleSection('model')}
                />
                <label htmlFor="sec-model">3D Model</label>
              </div>
              <div className="section-toggle">
                <input
                  type="checkbox"
                  id="sec-drawing"
                  checked={sections.drawing}
                  onChange={() => toggleSection('drawing')}
                />
                <label htmlFor="sec-drawing">Drawing</label>
              </div>
              <div className="section-toggle">
                <input
                  type="checkbox"
                  id="sec-dfm"
                  checked={sections.dfm}
                  onChange={() => toggleSection('dfm')}
                />
                <label htmlFor="sec-dfm">DFM Analysis</label>
              </div>
              <div className="section-toggle">
                <input
                  type="checkbox"
                  id="sec-tolerance"
                  checked={sections.tolerance}
                  onChange={() => toggleSection('tolerance')}
                />
                <label htmlFor="sec-tolerance">Tolerance Analysis</label>
              </div>
              <div className="section-toggle">
                <input
                  type="checkbox"
                  id="sec-cost"
                  checked={sections.cost}
                  onChange={() => toggleSection('cost')}
                />
                <label htmlFor="sec-cost">Cost Breakdown</label>
              </div>
              <div className="section-toggle">
                <input
                  type="checkbox"
                  id="sec-bom"
                  checked={sections.bom}
                  onChange={() => toggleSection('bom')}
                />
                <label htmlFor="sec-bom">Bill of Materials</label>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="form-group">
            <label>Options</label>
            <div className="form-row">
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Language</label>
                <select value={options.language} onChange={e => updateOption('language', e.target.value)}>
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="opt-disclaimer"
                    checked={options.disclaimer}
                    onChange={e => updateOption('disclaimer', e.target.checked)}
                  />
                  <label htmlFor="opt-disclaimer" style={{ fontSize: '13px', margin: 0 }}>Include Disclaimer</label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="opt-signature"
                    checked={options.signature}
                    onChange={e => updateOption('signature', e.target.checked)}
                  />
                  <label htmlFor="opt-signature" style={{ fontSize: '13px', margin: 0 }}>Include Signatures</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

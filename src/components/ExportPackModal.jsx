import React, { useState, useMemo } from 'react';

const EXPORT_OPTIONS = [
  { key: 'step', label: 'STEP File', default: true },
  { key: 'svg', label: 'SVG Drawing', default: true },
  { key: 'dxf', label: 'DXF Drawing', default: false },
  { key: 'drawing_pdf', label: 'Drawing PDF', default: true },
  { key: 'dfm', label: 'DFM JSON', default: true },
  { key: 'tolerance', label: 'Tolerance JSON', default: true },
  { key: 'cost', label: 'Cost JSON', default: true },
  { key: 'report', label: 'Engineering Report PDF', default: true },
  { key: 'bom', label: 'Bill of Materials CSV', default: true },
];

function estimateBase64Bytes(value) {
  if (!value || typeof value !== 'string') return 0;
  const cleaned = value.replace(/\s+/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createExportSummary(response, includeMap) {
  const selectedOutputs = EXPORT_OPTIONS.filter((opt) => includeMap?.[opt.key]).map((opt) => opt.label);
  const zipBytes = estimateBase64Bytes(response?.zipBase64 || '');
  return {
    filename: response?.filename || 'export-pack.zip',
    selectedOutputs,
    requestedCount: selectedOutputs.length,
    zipBytes,
    downloadStarted: Boolean(response?.zipBase64),
  };
}

export default function ExportPackModal({ configPath, activeProfile, templateName, onExport, onCancel }) {
  const [partName, setPartName] = useState('');
  const [revision, setRevision] = useState('A');
  const [organization, setOrganization] = useState('');
  const [includes, setIncludes] = useState(() => {
    const initial = {};
    EXPORT_OPTIONS.forEach(opt => {
      initial[opt.key] = opt.default;
    });
    return initial;
  });
  const [loading, setLoading] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportSummary, setExportSummary] = useState(null);

  const resetStatus = () => {
    setExportError('');
    setExportSummary(null);
  };

  const toggleInclude = (key) => {
    resetStatus();
    setIncludes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const folderStructure = useMemo(() => {
    const name = partName || 'part';
    const rev = revision || 'A';
    const lines = [`${name}_${rev}/`];
    if (includes.step) lines.push('  ├─ 01_model/');
    if (includes.step) lines.push(`  │   └─ ${name}.step`);
    if (includes.svg || includes.dxf || includes.drawing_pdf) lines.push('  ├─ 02_drawing/');
    if (includes.svg) lines.push(`  │   ├─ ${name}_drawing.svg`);
    if (includes.dxf) lines.push(`  │   ├─ ${name}_front.dxf`);
    if (includes.drawing_pdf) lines.push(`  │   └─ ${name}_drawing.pdf`);
    if (includes.dfm || includes.tolerance || includes.cost) lines.push('  ├─ 03_analysis/');
    if (includes.dfm) lines.push('  │   ├─ dfm_report.json');
    if (includes.tolerance) lines.push('  │   ├─ tolerance_report.json');
    if (includes.cost) lines.push('  │   ├─ cost_estimate.json');
    if (includes.cost) lines.push('  │   └─ cost_breakdown.csv');
    if (includes.report) lines.push('  ├─ 04_report/');
    if (includes.report) lines.push(`  │   └─ ${name}_report.pdf`);
    if (includes.bom) lines.push('  ├─ 05_bom/');
    if (includes.bom) lines.push('  │   └─ bom.csv');
    lines.push('  ├─ 06_config/');
    lines.push('  │   └─ source_config.toml');
    lines.push('  ├─ manifest.json');
    lines.push(`  └─ README.txt`);
    return lines.join('\n');
  }, [partName, revision, includes]);

  const handleExport = async () => {
    if (loading) return;

    const selectedCount = EXPORT_OPTIONS.reduce((count, opt) => count + (includes[opt.key] ? 1 : 0), 0);
    if (selectedCount === 0) {
      setExportSummary(null);
      setExportError('Select at least one output file before generating the package.');
      return;
    }

    setLoading(true);
    setExportError('');
    setExportSummary(null);
    try {
      const response = await onExport({
        configPath,
        partName: partName.trim() || undefined,
        revision,
        organization: organization.trim(),
        include: includes,
      });
      setExportSummary(createExportSummary(response, includes));
    } catch (error) {
      setExportError(error?.message || 'Export package generation failed. Check inputs and retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export Package</h2>
          <button className="btn-icon" onClick={onCancel}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Part Info */}
          <div className="form-group">
            <label>Part Information</label>
            <div className="form-row">
              <div style={{ flex: 2 }}>
                <input
                  type="text"
                  placeholder="Part Name *"
                  value={partName}
                  onChange={e => {
                    setPartName(e.target.value);
                    resetStatus();
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="Revision"
                  value={revision}
                  onChange={e => {
                    setRevision(e.target.value);
                    resetStatus();
                  }}
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Organization (Optional)</label>
            <input
              type="text"
              placeholder="Company or Organization Name"
              value={organization}
              onChange={e => {
                setOrganization(e.target.value);
                resetStatus();
              }}
            />
          </div>

          {/* Include Checkboxes */}
          <div className="form-group">
            <label>Include in Package</label>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Profile: {activeProfile || '_default'} | Template: {templateName || 'legacy'}
            </div>
            <div className="include-grid">
              {EXPORT_OPTIONS.map(opt => (
                <div key={opt.key} className="section-toggle">
                  <input
                    type="checkbox"
                    id={`inc-${opt.key}`}
                    checked={includes[opt.key]}
                    onChange={() => toggleInclude(opt.key)}
                  />
                  <label htmlFor={`inc-${opt.key}`}>{opt.label}</label>
                </div>
              ))}
            </div>
          </div>

          {/* Folder Preview */}
          <div className="form-group">
            <label>Package Structure</label>
            <div className="folder-preview">{folderStructure}</div>
          </div>

          {exportError && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                background: 'rgba(239, 68, 68, 0.12)',
                color: 'var(--error)',
                fontSize: '12px',
              }}
            >
              {exportError}
            </div>
          )}

          {exportSummary && (
            <div className="form-group">
              <label>Latest Export Result</label>
              <div className="feature-grid">
                <div className="feature-row">
                  <span className="feature-label">Package</span>
                  <span className="feature-value">{exportSummary.filename}</span>
                </div>
                <div className="feature-row">
                  <span className="feature-label">Selected Outputs</span>
                  <span className="feature-value">{exportSummary.requestedCount}</span>
                </div>
                <div className="feature-row">
                  <span className="feature-label">Archive Size</span>
                  <span className="feature-value">{formatBytes(exportSummary.zipBytes)}</span>
                </div>
                <div className="feature-row">
                  <span className="feature-label">Download</span>
                  <span className="feature-value">{exportSummary.downloadStarted ? 'Started' : 'Unavailable'}</span>
                </div>
              </div>
              <div
                style={{
                  marginTop: '8px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-primary)',
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Included Outputs
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-primary)' }}>
                  {exportSummary.selectedOutputs.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            {exportSummary ? 'Close' : 'Cancel'}
          </button>
          <button className="btn btn-primary" onClick={handleExport} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Package'}
          </button>
        </div>
      </div>
    </div>
  );
}

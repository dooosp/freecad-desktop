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

  const toggleInclude = (key) => {
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
    setLoading(true);
    try {
      await onExport({
        configPath,
        partName: partName || undefined,
        revision,
        organization,
        include: includes,
      });
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
                  onChange={e => setPartName(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="Revision"
                  value={revision}
                  onChange={e => setRevision(e.target.value)}
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
              onChange={e => setOrganization(e.target.value)}
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
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleExport} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Package'}
          </button>
        </div>
      </div>
    </div>
  );
}

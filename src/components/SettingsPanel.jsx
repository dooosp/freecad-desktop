import React, { useState, useEffect } from 'react';

const PROCESSES = [
  { value: 'machining', label: 'Machining' },
  { value: 'casting', label: 'Casting' },
  { value: 'sheet_metal', label: 'Sheet Metal' },
  { value: '3d_printing', label: '3D Printing' },
];

const MATERIALS = [
  { value: 'SS304', label: 'SS304' },
  { value: 'SS316', label: 'SS316' },
  { value: 'AL6061', label: 'AL6061' },
  { value: 'AL7075', label: 'AL7075' },
  { value: 'S45C', label: 'S45C' },
  { value: 'SCM440', label: 'SCM440' },
  { value: 'brass', label: 'Brass' },
  { value: 'titanium', label: 'Titanium' },
];

const STANDARDS = [
  { value: 'KS', label: 'KS' },
  { value: 'ISO', label: 'ISO' },
  { value: 'ANSI', label: 'ANSI' },
];

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsPanel({ settings, onChange, activeProfile, getCacheStats, clearCache, getDiagnostics }) {
  const [cacheStats, setCacheStats] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [diagResults, setDiagResults] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);

  useEffect(() => {
    if (getCacheStats) getCacheStats().then(s => s && setCacheStats(s));
  }, [getCacheStats]);

  const handleClearCache = async () => {
    if (!clearCache) return;
    setClearing(true);
    await clearCache();
    const s = getCacheStats ? await getCacheStats() : null;
    if (s) setCacheStats(s);
    setClearing(false);
  };

  const handleRunDiagnostics = async () => {
    if (!getDiagnostics) return;
    setDiagLoading(true);
    const result = await getDiagnostics();
    if (result) setDiagResults(result);
    setDiagLoading(false);
  };

  const update = (key, value) => {
    onChange({ ...settings, [key]: value });
  };

  // Filter processes and materials based on active profile
  const availableProcesses = PROCESSES.filter(p => {
    if (!activeProfile) return true;
    const cap = activeProfile.process_capabilities?.[p.value];
    return !cap || cap.available !== false;
  });

  const availableMaterials = MATERIALS.filter(m => {
    if (!activeProfile) return true;
    const rate = activeProfile.material_rates?.[m.value];
    return !rate || rate.available !== false;
  });

  return (
    <div className="sidebar-section settings-panel">
      <h3>Settings</h3>

      <div className="setting-group">
        <label>Process</label>
        <select
          value={settings.process}
          onChange={(e) => update('process', e.target.value)}
        >
          {availableProcesses.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="setting-group">
        <label>Material</label>
        <select
          value={settings.material}
          onChange={(e) => update('material', e.target.value)}
        >
          {availableMaterials.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="setting-group">
        <label>Standard</label>
        <select
          value={settings.standard}
          onChange={(e) => update('standard', e.target.value)}
        >
          {STANDARDS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="setting-group">
        <label>Batch Size</label>
        <input
          type="number"
          min="1"
          max="10000"
          value={settings.batch}
          onChange={(e) => update('batch', parseInt(e.target.value) || 1)}
        />
      </div>

      <div className="setting-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.dxfExport || false}
            onChange={(e) => update('dxfExport', e.target.checked)}
          />
          DXF Export
        </label>
      </div>

      {cacheStats && (
        <div className="setting-group cache-info">
          <label>Cache</label>
          <div className="cache-row">
            <span className="cache-size">
              {cacheStats.entries} entries ({formatBytes(cacheStats.totalSizeBytes)})
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleClearCache}
              disabled={clearing || cacheStats.entries === 0}
            >
              {clearing ? 'Clearing...' : 'Clear'}
            </button>
          </div>
        </div>
      )}

      <div className="setting-group diagnostics-section">
        <label>Diagnostics</label>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleRunDiagnostics}
          disabled={diagLoading}
        >
          {diagLoading ? 'Checking...' : 'Run Check'}
        </button>
        {diagResults && (
          <div className="diag-list">
            {diagResults.checks.map(c => (
              <div key={c.id} className="diag-item">
                <span className={`diag-status ${c.status}`}>
                  {c.status === 'pass' ? '\u2713' : c.status === 'fail' ? '\u2717' : '\u26A0'}
                </span>
                <span className="diag-label">{c.label}</span>
                <span className="diag-detail">{c.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

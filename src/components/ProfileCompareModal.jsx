import React, { useState } from 'react';

function fmt(n) {
  if (n == null) return '-';
  return typeof n === 'number' ? n.toLocaleString() : String(n);
}

function pctDiff(a, b) {
  if (!a || !b) return '';
  const diff = ((b - a) / a) * 100;
  if (!isFinite(diff)) return '';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}%`;
}

export default function ProfileCompareModal({ profiles, configPath, settings, backend, onCancel }) {
  const [profileA, setProfileA] = useState('_default');
  const [profileB, setProfileB] = useState(profiles.length > 1 ? profiles.find(p => p.name !== '_default')?.name || '_default' : '_default');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCompare = async () => {
    setLoading(true);
    setResults(null);
    try {
      const data = await backend.compareProfiles({
        configPath,
        profileA,
        profileB,
        options: {
          process: settings.process,
          material: settings.material,
          batch: settings.batch,
        },
      });
      setResults(data);
    } catch {
      // error handled by backend
    } finally {
      setLoading(false);
    }
  };

  const rA = results?.profileA;
  const rB = results?.profileB;

  const rows = [];
  if (rA && rB) {
    rows.push({ label: 'DFM Score', a: rA.dfm?.score ?? rA.dfm?.summary?.score, b: rB.dfm?.score ?? rB.dfm?.summary?.score });
    rows.push({ label: 'DFM Errors', a: rA.dfm?.summary?.errors ?? rA.dfm?.errors?.length, b: rB.dfm?.summary?.errors ?? rB.dfm?.errors?.length });
    rows.push({ label: 'DFM Warnings', a: rA.dfm?.summary?.warnings ?? 0, b: rB.dfm?.summary?.warnings ?? 0 });
    rows.push({ label: 'Unit Cost (KRW)', a: rA.cost?.unit_cost, b: rB.cost?.unit_cost, isCost: true });
    rows.push({ label: 'Total Cost (KRW)', a: rA.cost?.total_cost, b: rB.cost?.total_cost, isCost: true });
    rows.push({ label: 'Material Cost', a: rA.cost?.material_cost ?? rA.cost?.base_cost, b: rB.cost?.material_cost ?? rB.cost?.base_cost, isCost: true });
    rows.push({ label: 'Machining Cost', a: rA.cost?.machining_cost, b: rB.cost?.machining_cost, isCost: true });
    rows.push({ label: 'Setup Cost', a: rA.cost?.setup_cost, b: rB.cost?.setup_cost, isCost: true });
    rows.push({ label: 'Inspection Cost', a: rA.cost?.inspection_cost, b: rB.cost?.inspection_cost, isCost: true });
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Profile Comparison</h2>
          <button className="btn-icon" onClick={onCancel}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="compare-selectors">
            <div className="compare-select">
              <label>Profile A</label>
              <select value={profileA} onChange={e => setProfileA(e.target.value)}>
                {profiles.map(p => (
                  <option key={p.name} value={p.name}>{p.name === '_default' ? 'Default' : p.name}</option>
                ))}
              </select>
            </div>
            <div className="compare-vs">vs</div>
            <div className="compare-select">
              <label>Profile B</label>
              <select value={profileB} onChange={e => setProfileB(e.target.value)}>
                {profiles.map(p => (
                  <option key={p.name} value={p.name}>{p.name === '_default' ? 'Default' : p.name}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleCompare} disabled={loading || profileA === profileB}>
              {loading ? 'Comparing...' : 'Compare'}
            </button>
          </div>

          {profileA === profileB && (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>
              Select two different profiles to compare.
            </div>
          )}

          {results && rows.length > 0 && (
            <div className="compare-results">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>{rA.name === '_default' ? 'Default' : rA.name}</th>
                    <th>{rB.name === '_default' ? 'Default' : rB.name}</th>
                    <th>Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const diff = pctDiff(row.a, row.b);
                    const diffColor = !diff ? '' : row.label === 'DFM Score'
                      ? (row.b > row.a ? 'var(--success)' : 'var(--error)')
                      : row.isCost
                        ? (row.b > row.a ? 'var(--error)' : 'var(--success)')
                        : (row.b > row.a ? 'var(--error)' : 'var(--success)');
                    return (
                      <tr key={i}>
                        <td>{row.label}</td>
                        <td className="num">{fmt(row.a)}</td>
                        <td className="num">{fmt(row.b)}</td>
                        <td className="num" style={{ color: diffColor }}>{diff}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Visual cost comparison bar */}
              {rA.cost?.unit_cost && rB.cost?.unit_cost && (
                <div className="compare-bars">
                  <div className="compare-bar-label">{rA.name === '_default' ? 'Default' : rA.name}</div>
                  <div className="compare-bar-track">
                    <div className="compare-bar-fill bar-a" style={{
                      width: `${Math.min(100, (rA.cost.unit_cost / Math.max(rA.cost.unit_cost, rB.cost.unit_cost)) * 100)}%`
                    }}><span className="compare-bar-value">{fmt(rA.cost.unit_cost)} KRW</span></div>
                  </div>
                  <div className="compare-bar-label">{rB.name === '_default' ? 'Default' : rB.name}</div>
                  <div className="compare-bar-track">
                    <div className="compare-bar-fill bar-b" style={{
                      width: `${Math.min(100, (rB.cost.unit_cost / Math.max(rA.cost.unit_cost, rB.cost.unit_cost)) * 100)}%`
                    }}><span className="compare-bar-value">{fmt(rB.cost.unit_cost)} KRW</span></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Close</button>
        </div>
      </div>
    </div>
  );
}

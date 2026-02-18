import React, { useState } from 'react';

const MATERIALS = [
  { value: 'steel', label: 'Steel (7850 kg/m\u00B3)' },
  { value: 'aluminum', label: 'Aluminum (2700 kg/m\u00B3)' },
  { value: 'titanium', label: 'Titanium (4500 kg/m\u00B3)' },
  { value: 'copper', label: 'Copper (8960 kg/m\u00B3)' },
  { value: 'brass', label: 'Brass (8500 kg/m\u00B3)' },
];

const CONSTRAINT_TYPES = ['fixed', 'force', 'pressure'];

function safetyColor(sf) {
  if (sf >= 2.0) return 'var(--success)';
  if (sf >= 1.2) return 'var(--warning)';
  return 'var(--error)';
}

export default function FemPanel({ backend, configPath }) {
  const [analysisType, setAnalysisType] = useState('static');
  const [material, setMaterial] = useState('steel');
  const [meshMaxSize, setMeshMaxSize] = useState(5);
  const [meshMinSize, setMeshMinSize] = useState(1);
  const [numModes, setNumModes] = useState(6);
  const [constraints, setConstraints] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const addConstraint = () => {
    setConstraints([...constraints, { type: 'fixed', faces: '', valueX: 0, valueY: 0, valueZ: 0 }]);
  };

  const removeConstraint = (idx) => {
    setConstraints(constraints.filter((_, i) => i !== idx));
  };

  const updateConstraint = (idx, field, value) => {
    const updated = [...constraints];
    updated[idx] = { ...updated[idx], [field]: value };
    setConstraints(updated);
  };

  const handleRun = async () => {
    setBusy(true);
    setError(null);
    try {
      const femConfig = {
        analysisType,
        material,
        meshMaxSize: Number(meshMaxSize),
        meshMinSize: Number(meshMinSize),
        ...(analysisType === 'frequency' ? { numModes: Number(numModes) } : {}),
        constraints: constraints.map((c) => ({
          type: c.type,
          faces: c.faces.split(',').map((f) => f.trim()).filter(Boolean),
          ...(c.type !== 'fixed' ? { valueX: Number(c.valueX), valueY: Number(c.valueY), valueZ: Number(c.valueZ) } : {}),
        })),
      };
      const res = await backend.runFem(configPath, femConfig);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!configPath) {
    return (
      <div className="fem-panel">
        <div className="fem-no-config">Load or create a model first to run FEM analysis.</div>
      </div>
    );
  }

  return (
    <div className="fem-panel">
      <div className="fem-settings">
        <div className="fem-row">
          <label>Analysis Type</label>
          <select value={analysisType} onChange={(e) => setAnalysisType(e.target.value)}>
            <option value="static">Static</option>
            <option value="frequency">Modal (Frequency)</option>
          </select>
        </div>

        <div className="fem-row">
          <label>Material</label>
          <select value={material} onChange={(e) => setMaterial(e.target.value)}>
            {MATERIALS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="fem-row fem-row-pair">
          <div>
            <label>Mesh Max</label>
            <input type="number" min={0.1} step={0.5} value={meshMaxSize}
              onChange={(e) => setMeshMaxSize(e.target.value)} />
          </div>
          <div>
            <label>Mesh Min</label>
            <input type="number" min={0.1} step={0.5} value={meshMinSize}
              onChange={(e) => setMeshMinSize(e.target.value)} />
          </div>
        </div>

        {analysisType === 'frequency' && (
          <div className="fem-row">
            <label>Number of Modes</label>
            <input type="number" min={1} max={20} value={numModes}
              onChange={(e) => setNumModes(e.target.value)} />
          </div>
        )}

        <div className="fem-constraints">
          <div className="fem-constraints-header">
            <h4>Constraints</h4>
            <button className="btn btn-sm" onClick={addConstraint}>+ Add</button>
          </div>
          {constraints.map((c, i) => (
            <div key={i} className="fem-constraint-row">
              <select value={c.type} onChange={(e) => updateConstraint(i, 'type', e.target.value)}>
                {CONSTRAINT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Face1, Face2"
                value={c.faces}
                onChange={(e) => updateConstraint(i, 'faces', e.target.value)}
              />
              {c.type !== 'fixed' && (
                <div className="fem-force-inputs">
                  <input type="number" placeholder="X" value={c.valueX}
                    onChange={(e) => updateConstraint(i, 'valueX', e.target.value)} />
                  <input type="number" placeholder="Y" value={c.valueY}
                    onChange={(e) => updateConstraint(i, 'valueY', e.target.value)} />
                  <input type="number" placeholder="Z" value={c.valueZ}
                    onChange={(e) => updateConstraint(i, 'valueZ', e.target.value)} />
                </div>
              )}
              <button className="btn btn-sm btn-danger" onClick={() => removeConstraint(i)}>x</button>
            </div>
          ))}
        </div>

        <button
          className="btn btn-accent fem-run-btn"
          onClick={handleRun}
          disabled={busy}
        >
          {busy ? 'Solving...' : 'Run FEM'}
        </button>
      </div>

      {error && <div className="fem-error">{error}</div>}

      {result && (
        <div className="fem-results">
          <h4>Results</h4>
          <div className="fem-results-grid">
            {result.max_displacement != null && (
              <div className="fem-result-card">
                <span className="label">Max Displacement</span>
                <span className="value">{result.max_displacement.toFixed(4)} mm</span>
              </div>
            )}
            {result.max_stress != null && (
              <div className="fem-result-card">
                <span className="label">Max von Mises</span>
                <span className="value">{result.max_stress.toFixed(1)} MPa</span>
              </div>
            )}
            {result.safety_factor != null && (
              <div className="fem-result-card">
                <span className="label">Safety Factor</span>
                <span className="value" style={{ color: safetyColor(result.safety_factor) }}>
                  {result.safety_factor.toFixed(2)}
                </span>
              </div>
            )}
            {result.frequencies && (
              <div className="fem-result-card full">
                <span className="label">Natural Frequencies</span>
                <span className="value">
                  {result.frequencies.map((f, i) => `Mode ${i + 1}: ${f.toFixed(1)} Hz`).join(', ')}
                </span>
              </div>
            )}
          </div>
          {result.mesh_info && (
            <div className="fem-mesh-info">
              Mesh: {result.mesh_info.nodes || '?'} nodes, {result.mesh_info.elements || '?'} elements
            </div>
          )}
        </div>
      )}
    </div>
  );
}

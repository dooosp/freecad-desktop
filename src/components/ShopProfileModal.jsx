import React, { useState, useEffect } from 'react';

const PROCESS_TYPES = [
  { key: 'machining', label: 'Machining' },
  { key: 'casting', label: 'Casting' },
  { key: 'sheet_metal', label: 'Sheet Metal' },
  { key: '3d_printing', label: '3D Printing' },
];

const MATERIAL_TYPES = [
  { key: 'SS304', label: 'SS304' },
  { key: 'SS316', label: 'SS316' },
  { key: 'AL6061', label: 'AL6061' },
  { key: 'AL7075', label: 'AL7075' },
  { key: 'S45C', label: 'S45C' },
  { key: 'SCM440', label: 'SCM440' },
  { key: 'brass', label: 'Brass' },
  { key: 'titanium', label: 'Titanium' },
];

const DEFAULT_PROFILE = {
  name: '',
  description: '',
  process_capabilities: {
    machining: { available: true, rate_per_hour: 50000, setup_cost: 30000 },
    casting: { available: true, rate_per_hour: 40000, setup_cost: 100000 },
    sheet_metal: { available: true, rate_per_hour: 35000, setup_cost: 25000 },
    '3d_printing': { available: true, rate_per_hour: 30000, setup_cost: 5000 },
  },
  material_rates: {
    SS304: { available: true, cost_per_kg: 5000 },
    SS316: { available: true, cost_per_kg: 7000 },
    AL6061: { available: true, cost_per_kg: 4000 },
    AL7075: { available: true, cost_per_kg: 6000 },
    S45C: { available: true, cost_per_kg: 3000 },
    SCM440: { available: true, cost_per_kg: 4000 },
    brass: { available: true, cost_per_kg: 8000 },
    titanium: { available: true, cost_per_kg: 30000 },
  },
  tolerance_capabilities: {
    min_it_grade: 7,
    max_it_grade: 12,
    surface_finish_range: { min: 0.8, max: 6.3 },
  },
  inspection: {
    cost_per_tolerance_pair: 5000,
    cmm_available: true,
  },
  batch_discounts: [
    { min_qty: 1, max_qty: 10, discount: 0 },
    { min_qty: 11, max_qty: 100, discount: 0.1 },
    { min_qty: 101, max_qty: 500, discount: 0.2 },
    { min_qty: 501, max_qty: null, discount: 0.3 },
  ],
};

export default function ShopProfileModal({ profile, onSave, onDelete, onCancel }) {
  const [tab, setTab] = useState('general');
  const [data, setData] = useState(() => {
    if (profile && !profile._isNew) {
      return JSON.parse(JSON.stringify(profile));
    }
    return JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  });

  const update = (path, value) => {
    const keys = path.split('.');
    setData(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      let target = next;
      for (let i = 0; i < keys.length - 1; i++) {
        target = target[keys[i]];
      }
      target[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const handleSave = () => {
    if (!data.name || data.name === '_default') {
      alert('Profile name is required and cannot be "_default"');
      return;
    }
    onSave(data);
  };

  const handleDelete = () => {
    if (confirm(`Delete profile "${data.name}"?`)) {
      onDelete(data.name);
    }
  };

  const isNew = profile?._isNew;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isNew ? 'New Shop Profile' : `Edit Profile: ${profile.name}`}</h2>
          <button className="btn-icon" onClick={onCancel}>&times;</button>
        </div>

        <div className="modal-tabs">
          <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>
            General
          </button>
          <button className={tab === 'processes' ? 'active' : ''} onClick={() => setTab('processes')}>
            Processes
          </button>
          <button className={tab === 'materials' ? 'active' : ''} onClick={() => setTab('materials')}>
            Materials
          </button>
          <button className={tab === 'tolerances' ? 'active' : ''} onClick={() => setTab('tolerances')}>
            Tolerances
          </button>
          <button className={tab === 'batch' ? 'active' : ''} onClick={() => setTab('batch')}>
            Batch Discounts
          </button>
        </div>

        <div className="modal-body">
          {tab === 'general' && (
            <>
              <div className="form-group">
                <label>Profile Name</label>
                <input
                  type="text"
                  value={data.name}
                  onChange={e => update('name', e.target.value)}
                  placeholder="e.g., small-shop, precision-machining"
                  disabled={!isNew}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={data.description}
                  onChange={e => update('description', e.target.value)}
                  rows="3"
                  placeholder="Brief description of this shop profile"
                />
              </div>
            </>
          )}

          {tab === 'processes' && (
            <div>
              {PROCESS_TYPES.map(proc => {
                const cap = data.process_capabilities[proc.key] || {};
                return (
                  <div key={proc.key} className="toggle-row" style={{ marginBottom: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <input
                          type="checkbox"
                          checked={cap.available || false}
                          onChange={e => update(`process_capabilities.${proc.key}.available`, e.target.checked)}
                        />
                        <span className="toggle-label">{proc.label}</span>
                      </div>
                      {cap.available && (
                        <div style={{ display: 'flex', gap: '8px', marginLeft: '24px' }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Rate/Hour (₩)</label>
                            <input
                              type="number"
                              value={cap.rate_per_hour || 0}
                              onChange={e => update(`process_capabilities.${proc.key}.rate_per_hour`, parseInt(e.target.value) || 0)}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Setup Cost (₩)</label>
                            <input
                              type="number"
                              value={cap.setup_cost || 0}
                              onChange={e => update(`process_capabilities.${proc.key}.setup_cost`, parseInt(e.target.value) || 0)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'materials' && (
            <div>
              {MATERIAL_TYPES.map(mat => {
                const rate = data.material_rates[mat.key] || {};
                return (
                  <div key={mat.key} className="toggle-row" style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={rate.available || false}
                        onChange={e => update(`material_rates.${mat.key}.available`, e.target.checked)}
                      />
                      <span className="toggle-label">{mat.label}</span>
                    </div>
                    {rate.available && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="number"
                          value={rate.cost_per_kg || 0}
                          onChange={e => update(`material_rates.${mat.key}.cost_per_kg`, parseInt(e.target.value) || 0)}
                          style={{ width: '100px' }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>₩/kg</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'tolerances' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Min IT Grade</label>
                  <input
                    type="number"
                    min="5"
                    max="18"
                    value={data.tolerance_capabilities.min_it_grade}
                    onChange={e => update('tolerance_capabilities.min_it_grade', parseInt(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label>Max IT Grade</label>
                  <input
                    type="number"
                    min="5"
                    max="18"
                    value={data.tolerance_capabilities.max_it_grade}
                    onChange={e => update('tolerance_capabilities.max_it_grade', parseInt(e.target.value))}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Surface Finish Min (μm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={data.tolerance_capabilities.surface_finish_range.min}
                    onChange={e => update('tolerance_capabilities.surface_finish_range.min', parseFloat(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label>Surface Finish Max (μm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={data.tolerance_capabilities.surface_finish_range.max}
                    onChange={e => update('tolerance_capabilities.surface_finish_range.max', parseFloat(e.target.value))}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Inspection Cost/Pair (₩)</label>
                  <input
                    type="number"
                    value={data.inspection.cost_per_tolerance_pair}
                    onChange={e => update('inspection.cost_per_tolerance_pair', parseInt(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label>CMM Available</label>
                  <select
                    value={data.inspection.cmm_available ? 'yes' : 'no'}
                    onChange={e => update('inspection.cmm_available', e.target.value === 'yes')}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {tab === 'batch' && (
            <div>
              <table className="discount-table">
                <thead>
                  <tr>
                    <th>Min Qty</th>
                    <th>Max Qty</th>
                    <th>Discount (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.batch_discounts.map((tier, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          type="number"
                          value={tier.min_qty}
                          onChange={e => {
                            const tiers = [...data.batch_discounts];
                            tiers[idx].min_qty = parseInt(e.target.value) || 1;
                            update('batch_discounts', tiers);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={tier.max_qty || ''}
                          onChange={e => {
                            const tiers = [...data.batch_discounts];
                            tiers[idx].max_qty = e.target.value ? parseInt(e.target.value) : null;
                            update('batch_discounts', tiers);
                          }}
                          placeholder="∞"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={tier.discount}
                          onChange={e => {
                            const tiers = [...data.batch_discounts];
                            tiers[idx].discount = parseFloat(e.target.value) || 0;
                            update('batch_discounts', tiers);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!isNew && data.name !== '_default' && (
            <button className="btn btn-secondary" onClick={handleDelete} style={{ marginRight: 'auto' }}>
              Delete
            </button>
          )}
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';

export default function StepImportModal({ data, onUseConfig, onSaveConfig, onCancel }) {
  const [toml, setToml] = useState(data.tomlString || '');
  const [edited, setEdited] = useState(false);

  const analysis = data.analysis || {};
  const features = analysis.features || analysis.suggested_config || {};

  const handleTomlChange = (e) => {
    setToml(e.target.value);
    setEdited(true);
  };

  const handleUseConfig = async () => {
    if (edited) {
      await onSaveConfig(data.configPath, toml);
    }
    onUseConfig(data.configPath);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>STEP Import</h2>
          <button className="btn-icon" onClick={onCancel}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Feature summary */}
          <div className="step-features">
            <h3>Detected Features</h3>
            <div className="feature-grid">
              {features.name && (
                <div className="feature-row">
                  <span className="feature-label">Name</span>
                  <span className="feature-value">{features.name}</span>
                </div>
              )}
              {analysis.part_type && (
                <div className="feature-row">
                  <span className="feature-label">Part Type</span>
                  <span className="feature-value">{analysis.part_type}</span>
                </div>
              )}
              {analysis.bounding_box && (
                <div className="feature-row">
                  <span className="feature-label">Bounding Box</span>
                  <span className="feature-value">
                    {analysis.bounding_box.x?.toFixed(1)} x {analysis.bounding_box.y?.toFixed(1)} x {analysis.bounding_box.z?.toFixed(1)} mm
                  </span>
                </div>
              )}
              {analysis.cylinders > 0 && (
                <div className="feature-row">
                  <span className="feature-label">Cylinders</span>
                  <span className="feature-value">{analysis.cylinders}</span>
                </div>
              )}
              {analysis.bolt_circles > 0 && (
                <div className="feature-row">
                  <span className="feature-label">Bolt Circles</span>
                  <span className="feature-value">{analysis.bolt_circles}</span>
                </div>
              )}
              {features.manufacturing?.process && (
                <div className="feature-row">
                  <span className="feature-label">Process</span>
                  <span className="feature-value">{features.manufacturing.process}</span>
                </div>
              )}
            </div>
          </div>

          {/* TOML editor */}
          <div className="toml-editor-section">
            <h3>Generated Config</h3>
            <textarea
              className="toml-editor"
              value={toml}
              onChange={handleTomlChange}
              spellCheck={false}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleUseConfig}>
            Use Config
          </button>
        </div>
      </div>
    </div>
  );
}

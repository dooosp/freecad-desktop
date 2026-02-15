import React from 'react';

export default function AppEmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-content">
        <div className="empty-icon">&#9881;</div>
        <h3>Ready to Analyze</h3>
        <div className="empty-steps">
          <div className="empty-step">
            <span className="step-num">1</span>
            <span>Select a config or drop a STEP/TOML file</span>
          </div>
          <div className="empty-step">
            <span className="step-num">2</span>
            <span>Adjust process, material, and batch settings</span>
          </div>
          <div className="empty-step">
            <span className="step-num">3</span>
            <span>Click <strong>Analyze</strong> to run the full pipeline</span>
          </div>
        </div>
      </div>
    </div>
  );
}

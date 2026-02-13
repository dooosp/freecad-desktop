import React from 'react';

const STAGE_LABELS = {
  analyzing: 'Analyzing...',
  create: 'Creating 3D Model',
  drawing: 'Generating Drawing',
  dfm: 'DFM Analysis',
  tolerance: 'Tolerance Analysis',
  cost: 'Cost Estimation',
  report: 'Generating Report',
  done: 'Complete',
  error: 'Error',
};

export default function ProgressBar({ stage, stages = [] }) {
  const allStages = ['create', 'drawing', 'dfm', 'tolerance', 'cost'];
  const completedCount = stages ? stages.length : 0;
  const progress = stage === 'done' ? 100 : (completedCount / allStages.length) * 100;

  return (
    <div className="progress-bar-container">
      <div className="progress-track">
        <div
          className={`progress-fill ${stage === 'error' ? 'error' : ''}`}
          style={{ width: `${Math.max(5, progress)}%` }}
        />
      </div>
      <span className="progress-label">
        {STAGE_LABELS[stage] || stage || 'Processing...'}
      </span>
    </div>
  );
}

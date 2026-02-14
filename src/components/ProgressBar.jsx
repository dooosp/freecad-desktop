import React from 'react';

const STAGES = [
  { key: 'create', label: '3D Model' },
  { key: 'drawing', label: 'Drawing' },
  { key: 'dfm', label: 'DFM' },
  { key: 'tolerance', label: 'Tolerance' },
  { key: 'cost', label: 'Cost' },
];

export default function ProgressBar({ progress }) {
  if (!progress) return null;

  const { stage, status, completed = [], total = 5 } = progress;
  const percent = status === 'done' ? 100 : (completed.length / total) * 100;
  const isError = status === 'error';

  return (
    <div className="progress-bar-container">
      <div className="progress-track">
        <div
          className={`progress-fill ${isError ? 'error' : ''}`}
          style={{ width: `${Math.max(5, percent)}%` }}
        />
      </div>
      <div className="progress-stages">
        {STAGES.map(s => {
          const isDone = completed.includes(s.key);
          const isActive = stage === s.key && status === 'start';
          const isFailed = stage === s.key && isError;
          return (
            <span
              key={s.key}
              className={`progress-step${isDone ? ' done' : ''}${isActive ? ' active' : ''}${isFailed ? ' failed' : ''}`}
            >
              {isDone ? '\u2713' : isFailed ? '\u2717' : ''} {s.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

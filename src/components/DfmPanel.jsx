import React from 'react';

const CHECK_LABELS = {
  'DFM-01': { name: 'Wall Thickness', icon: '▦' },
  'DFM-02': { name: 'Hole Edge Distance', icon: '○' },
  'DFM-03': { name: 'Hole Spacing', icon: '◉' },
  'DFM-04': { name: 'Fillet Radius', icon: '◯' },
  'DFM-05': { name: 'Drill Ratio', icon: '↱' },
  'DFM-06': { name: 'Undercut', icon: '⏤' },
};

function getSeverityClass(severity) {
  if (severity === 'error' || severity === 'fail') return 'severity-error';
  if (severity === 'warning' || severity === 'warn') return 'severity-warning';
  return 'severity-ok';
}

function getSeverityIcon(severity) {
  if (severity === 'error' || severity === 'fail') return '\u2716';  // X
  if (severity === 'warning' || severity === 'warn') return '\u26A0'; // Warning
  return '\u2714'; // Check
}

export default function DfmPanel({ data }) {
  if (!data) return null;

  const checks = data.checks || data.results || [];
  const score = data.score ?? data.overall_score ?? 0;
  const process = data.process || 'machining';

  return (
    <div className="dfm-panel">
      {/* Score Gauge */}
      <div className="dfm-score-section">
        <div className="score-gauge">
          <div
            className="score-fill"
            style={{
              width: `${score}%`,
              backgroundColor: score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444',
            }}
          />
          <span className="score-label">{Math.round(score)}/100</span>
        </div>
        <div className="process-badge">{process}</div>
      </div>

      {/* Check Cards */}
      <div className="dfm-checks">
        {checks.map((check, i) => {
          const id = check.code || check.id || check.check_id || `DFM-${String(i + 1).padStart(2, '0')}`;
          const meta = CHECK_LABELS[id] || { name: id, icon: '■' };
          const severity = check.severity || check.status || 'ok';
          const message = check.message || check.detail || '';
          const recommendation = check.recommendation || check.suggestion || '';

          return (
            <div key={`${id}-${i}`} className={`dfm-card ${getSeverityClass(severity)}`}>
              <div className="dfm-card-header">
                <span className="dfm-icon">{meta.icon}</span>
                <span className="dfm-id">{id}</span>
                <span className="dfm-name">{meta.name}</span>
                <span className="dfm-status">{getSeverityIcon(severity)}</span>
              </div>
              {message && <div className="dfm-message">{message}</div>}
              {recommendation && (
                <div className="dfm-recommendation">{recommendation}</div>
              )}
              {check.value !== undefined && (
                <div className="dfm-value">
                  Measured: <strong>{check.value}</strong>
                  {check.threshold && <> / Min: <strong>{check.threshold}</strong></>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {data.summary && (
        <div className="dfm-summary">
          <h4>Summary</h4>
          {typeof data.summary === 'string' ? (
            <p>{data.summary}</p>
          ) : (
            <p>
              {data.summary.errors > 0 && <span className="severity-error">{data.summary.errors} errors</span>}
              {data.summary.errors > 0 && data.summary.warnings > 0 && ' / '}
              {data.summary.warnings > 0 && <span className="severity-warning">{data.summary.warnings} warnings</span>}
              {(data.summary.errors > 0 || data.summary.warnings > 0) && data.summary.info > 0 && ' / '}
              {data.summary.info > 0 && <span>{data.summary.info} info</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

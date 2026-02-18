import React, { useState } from 'react';

const STEP_INPUT = 'input';
const STEP_PREVIEW = 'preview';
const STEP_RESULT = 'result';

export default function AiDesignPanel({ backend, onBuildComplete }) {
  const [step, setStep] = useState(STEP_INPUT);
  const [description, setDescription] = useState('');
  const [toml, setToml] = useState('');
  const [report, setReport] = useState(null);
  const [issues, setIssues] = useState(null);
  const [buildResult, setBuildResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await backend.runDesign(description);
      setToml(result.toml || result.correctedToml || '');
      setReport(result.report || result.designReport || null);
      setStep(STEP_PREVIEW);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReview = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await backend.runDesignReview(toml);
      setIssues(result.issues || []);
      if (result.correctedToml) setToml(result.correctedToml);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleBuild = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await backend.runDesignBuild(toml);
      setBuildResult(result);
      setStep(STEP_RESULT);
      onBuildComplete?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setStep(STEP_INPUT);
    setDescription('');
    setToml('');
    setReport(null);
    setIssues(null);
    setBuildResult(null);
    setError(null);
  };

  return (
    <div className="ai-design-panel">
      {error && <div className="ai-design-error">{error}</div>}

      {step === STEP_INPUT && (
        <div className="ai-design-input">
          <label className="ai-design-label">Describe your design</label>
          <textarea
            className="ai-design-textarea"
            rows={5}
            placeholder="e.g. A planetary gear reducer with 3:1 ratio, input shaft 20mm..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
          <button
            className="btn btn-accent"
            onClick={handleGenerate}
            disabled={busy || !description.trim()}
          >
            {busy ? 'Generating...' : 'Generate Design'}
          </button>
        </div>
      )}

      {step === STEP_PREVIEW && (
        <div className="ai-design-preview">
          {report && (
            <div className="ai-design-report">
              <h4>Design Report</h4>
              <div className="ai-design-report-grid">
                {report.mechanism_type && (
                  <div className="ai-design-report-item">
                    <span className="label">Type</span>
                    <span className="value">{report.mechanism_type}</span>
                  </div>
                )}
                {report.dof != null && (
                  <div className="ai-design-report-item">
                    <span className="label">DOF</span>
                    <span className="value">{report.dof}</span>
                  </div>
                )}
                {report.total_issues != null && (
                  <div className="ai-design-report-item">
                    <span className="label">Issues</span>
                    <span className="value">{report.total_issues} ({report.critical_count || 0} critical)</span>
                  </div>
                )}
                {report.recommendation && (
                  <div className="ai-design-report-item full">
                    <span className="label">Recommendation</span>
                    <span className="value">{report.recommendation}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <label className="ai-design-label">TOML Configuration</label>
          <textarea
            className="ai-design-toml-editor"
            rows={12}
            value={toml}
            onChange={(e) => setToml(e.target.value)}
            disabled={busy}
            spellCheck={false}
          />

          {issues && issues.length > 0 && (
            <div className="ai-design-issues">
              <h4>Review Issues ({issues.length})</h4>
              <ul>
                {issues.map((issue, i) => (
                  <li key={i} className={`issue-${issue.severity || 'info'}`}>
                    <strong>{issue.severity || 'info'}:</strong> {issue.description || issue.message || issue.fix}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="ai-design-actions">
            <button className="btn" onClick={handleReset} disabled={busy}>Back</button>
            <button className="btn" onClick={handleReview} disabled={busy || !toml.trim()}>
              {busy ? 'Reviewing...' : 'Review'}
            </button>
            <button className="btn btn-accent" onClick={handleBuild} disabled={busy || !toml.trim()}>
              {busy ? 'Building...' : 'Build 3D'}
            </button>
          </div>
        </div>
      )}

      {step === STEP_RESULT && (
        <div className="ai-design-result">
          <h4>Build Complete</h4>
          {buildResult?.exports && (
            <div className="ai-design-exports">
              {buildResult.exports.map((exp, i) => (
                <div key={i} className="export-item">
                  <span className="format">{exp.format?.toUpperCase()}</span>
                  <span className="path">{exp.path}</span>
                </div>
              ))}
            </div>
          )}
          {buildResult?.configPath && (
            <div className="ai-design-config-path">
              Config: <code>{buildResult.configPath}</code>
            </div>
          )}
          <button className="btn" onClick={handleReset}>New Design</button>
        </div>
      )}
    </div>
  );
}

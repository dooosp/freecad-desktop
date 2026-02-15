import React from 'react';

export default function AppHeader({
  backend,
  configPath,
  results,
  onOpenProject,
  onSaveProject,
  onAnalyze,
  onOpenReportConfig,
  onOpenExportPack,
}) {
  return (
    <header className="header">
      <div className="header-left">
        <h1 className="logo">FreeCAD Studio</h1>
      </div>
      <div className="header-actions">
        <button
          className="btn btn-secondary"
          disabled={backend.loading}
          onClick={onOpenProject}
          title="Open recent project"
        >
          Open
        </button>
        <button
          className="btn btn-secondary"
          disabled={!configPath || backend.loading}
          onClick={onSaveProject}
          title="Save project"
        >
          Save
        </button>
        {backend.loading && backend.progress && backend.progress.status !== 'done' && (
          <button className="btn btn-secondary" onClick={backend.cancelAnalyze}>
            Cancel
          </button>
        )}
        <button
          className="btn btn-primary"
          disabled={!configPath || backend.loading}
          onClick={onAnalyze}
        >
          {backend.loading ? 'Analyzing...' : 'Analyze'}
        </button>
        <button
          className="btn btn-secondary"
          disabled={!results || backend.loading}
          onClick={onOpenReportConfig}
        >
          Report
        </button>
        <button
          className="btn btn-secondary"
          disabled={!configPath || backend.loading}
          onClick={onOpenExportPack}
        >
          Export Pack
        </button>
      </div>
    </header>
  );
}

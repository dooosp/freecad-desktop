import React from 'react';
import { useAppShell } from '../contexts/AppShellContext.jsx';

export default function AppHeader() {
  /** @type {import('../contracts/appShellContracts.js').AppShellContextValue} */
  const { backend, projectState, modalState } = useAppShell();

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="logo">FreeCAD Studio</h1>
      </div>
      <div className="header-actions">
        <button
          className="btn btn-secondary"
          disabled={backend.loading}
          onClick={projectState.handleOpenProject}
          title="Open recent project"
        >
          Open
        </button>
        <button
          className="btn btn-secondary"
          disabled={!projectState.configPath || backend.loading}
          onClick={projectState.handleSaveProject}
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
          disabled={!projectState.configPath || backend.loading}
          onClick={projectState.handleAnalyze}
        >
          {backend.loading ? 'Analyzing...' : 'Analyze'}
        </button>
        <button
          className="btn btn-secondary"
          disabled={!projectState.results || backend.loading}
          onClick={modalState.openReportModal}
        >
          Report
        </button>
        <button
          className="btn btn-secondary"
          disabled={!projectState.configPath || backend.loading}
          onClick={modalState.openExportModal}
        >
          Export Pack
        </button>
      </div>
    </header>
  );
}

import React from 'react';
import AppSidebar from './layout/AppSidebar.jsx';
import AppViewerSection from './layout/AppViewerSection.jsx';
import AppAnalysisSection from './layout/AppAnalysisSection.jsx';
import AppEmptyState from './layout/AppEmptyState.jsx';
import { useAppShell } from '../contexts/AppShellContext.jsx';

export default function AppMainLayout() {
  /** @type {import('../contracts/appShellContracts.js').AppShellContextValue} */
  const { backend, projectState } = useAppShell();

  return (
    <div className="main-layout">
      <AppSidebar />

      <main className="content">
        <AppViewerSection />

        {projectState.results && <AppAnalysisSection />}

        {!projectState.results && !backend.loading && <AppEmptyState />}
      </main>
    </div>
  );
}

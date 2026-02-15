import React from 'react';
import { useBackend } from './hooks/useBackend.js';
import { useProjectState } from './hooks/useProjectState.js';
import { useProfileState } from './hooks/useProfileState.js';
import { useModalState } from './hooks/useModalState.js';
import { AppShellProvider } from './contexts/AppShellContext.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import AppHeader from './components/AppHeader.jsx';
import AppMainLayout from './components/AppMainLayout.jsx';
import AppModals from './components/AppModals.jsx';

export default function App() {
  const backend = useBackend();

  const profileState = useProfileState({ backend });
  const projectState = useProjectState({
    backend,
    activeProfile: profileState.activeProfile,
    setActiveProfile: profileState.setActiveProfile,
  });
  const modalState = useModalState({
    backend,
    configPath: projectState.configPath,
    results: projectState.results,
    setResults: projectState.setResults,
    activeProfile: profileState.activeProfile,
    setViewerTab: projectState.setViewerTab,
  });

  const shell = {
    backend,
    profileState,
    projectState,
    modalState,
  };

  return (
    <AppShellProvider value={shell}>
      <div className="app">
        <AppHeader />

        {backend.progress && backend.progress.status !== 'done' && (
          <ProgressBar progress={backend.progress} />
        )}

        {backend.error && (
          <div className="error-bar">
            <span className="error-message">{backend.error}</span>
            <button className="error-dismiss" onClick={() => backend.setError(null)}>
              Dismiss
            </button>
          </div>
        )}

        <AppMainLayout />
        <AppModals />
      </div>
    </AppShellProvider>
  );
}

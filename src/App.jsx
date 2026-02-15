import React from 'react';
import { useBackend } from './hooks/useBackend.js';
import { useProjectState } from './hooks/useProjectState.js';
import { useProfileState } from './hooks/useProfileState.js';
import { useModalState } from './hooks/useModalState.js';
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

  return (
    <div className="app">
      <AppHeader
        backend={backend}
        configPath={projectState.configPath}
        results={projectState.results}
        onOpenProject={projectState.handleOpenProject}
        onSaveProject={projectState.handleSaveProject}
        onAnalyze={projectState.handleAnalyze}
        onOpenReportConfig={modalState.openReportModal}
        onOpenExportPack={modalState.openExportModal}
      />

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

      <AppMainLayout
        backend={backend}
        profiles={profileState.profiles}
        activeProfile={profileState.activeProfile}
        activeProfileData={profileState.activeProfileData}
        onProfileChange={profileState.handleProfileChange}
        onEditProfile={profileState.handleEditProfile}
        onNewProfile={profileState.handleNewProfile}
        onCompareProfiles={profileState.openCompareModal}
        onFileSelect={projectState.handleFileSelect}
        examples={projectState.examples}
        configPath={projectState.configPath}
        settings={projectState.settings}
        onSettingsChange={projectState.setSettings}
        results={projectState.results}
        viewerTab={projectState.viewerTab}
        onViewerTabChange={projectState.setViewerTab}
        analysisTab={projectState.analysisTab}
        onAnalysisTabChange={projectState.setAnalysisTab}
        rerunning={projectState.rerunning}
        onRerunStage={projectState.handleRerunStage}
        onOpenReportConfig={modalState.openReportModal}
      />

      <AppModals
        backend={backend}
        configPath={projectState.configPath}
        settings={projectState.settings}
        profiles={profileState.profiles}
        activeProfile={profileState.activeProfile}
        lastTemplateName={modalState.lastTemplateName}
        stepImportData={projectState.stepImportData}
        onUseStepConfig={projectState.handleUseStepConfig}
        onSaveStepConfig={projectState.handleSaveStepConfig}
        onCloseStepImport={() => projectState.setStepImportData(null)}
        showProfileModal={profileState.showProfileModal}
        editingProfile={profileState.editingProfile}
        onSaveProfile={profileState.handleSaveProfile}
        onDeleteProfile={profileState.handleDeleteProfile}
        onCloseProfileModal={profileState.closeProfileModal}
        showReportModal={modalState.showReportModal}
        onGenerateReport={modalState.handleGenerateReport}
        onCloseReportModal={modalState.closeReportModal}
        onEditTemplate={modalState.handleEditTemplate}
        onNewTemplate={modalState.handleNewTemplate}
        showTemplateEditor={modalState.showTemplateEditor}
        editingTemplate={modalState.editingTemplate}
        onSaveTemplate={modalState.handleSaveTemplate}
        onDeleteTemplate={modalState.handleDeleteTemplate}
        onCloseTemplateEditor={modalState.closeTemplateEditor}
        showCompareModal={profileState.showCompareModal}
        onCloseCompareModal={profileState.closeCompareModal}
        showExportModal={modalState.showExportModal}
        onExportPack={modalState.handleExportPack}
        onCloseExportModal={modalState.closeExportModal}
      />
    </div>
  );
}

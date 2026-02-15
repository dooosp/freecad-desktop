import React from 'react';
import ProfileCompareModal from '../ProfileCompareModal.jsx';
import ExportPackModal from '../ExportPackModal.jsx';
import { useAppShell } from '../../contexts/AppShellContext.jsx';

export default function AnalysisFlowModals() {
  const { backend, profileState, projectState, modalState } = useAppShell();

  return (
    <>
      {profileState.showCompareModal && (
        <ProfileCompareModal
          profiles={profileState.profiles}
          configPath={projectState.configPath}
          settings={projectState.settings}
          backend={backend}
          onCancel={profileState.closeCompareModal}
        />
      )}

      {modalState.showExportModal && (
        <ExportPackModal
          configPath={projectState.configPath}
          activeProfile={profileState.activeProfile}
          templateName={modalState.lastTemplateName}
          onExport={modalState.handleExportPack}
          onCancel={modalState.closeExportModal}
        />
      )}
    </>
  );
}

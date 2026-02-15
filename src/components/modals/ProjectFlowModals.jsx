import React from 'react';
import StepImportModal from '../StepImportModal.jsx';
import ShopProfileModal from '../ShopProfileModal.jsx';
import ReportConfigModal from '../ReportConfigModal.jsx';
import TemplateEditorModal from '../TemplateEditorModal.jsx';
import { useAppShell } from '../../contexts/AppShellContext.jsx';

export default function ProjectFlowModals() {
  const { backend, profileState, projectState, modalState } = useAppShell();

  return (
    <>
      {projectState.stepImportData && (
        <StepImportModal
          data={projectState.stepImportData}
          onUseConfig={projectState.handleUseStepConfig}
          onSaveConfig={projectState.handleSaveStepConfig}
          onCancel={() => projectState.setStepImportData(null)}
        />
      )}

      {profileState.showProfileModal && (
        <ShopProfileModal
          profile={profileState.editingProfile}
          onSave={profileState.handleSaveProfile}
          onDelete={profileState.handleDeleteProfile}
          onCancel={profileState.closeProfileModal}
        />
      )}

      {modalState.showReportModal && (
        <ReportConfigModal
          backend={backend}
          onGenerate={modalState.handleGenerateReport}
          onCancel={modalState.closeReportModal}
          onEditTemplate={modalState.handleEditTemplate}
          onNewTemplate={modalState.handleNewTemplate}
        />
      )}

      {modalState.showTemplateEditor && (
        <TemplateEditorModal
          template={modalState.editingTemplate}
          onSave={modalState.handleSaveTemplate}
          onDelete={modalState.handleDeleteTemplate}
          onCancel={modalState.closeTemplateEditor}
        />
      )}
    </>
  );
}

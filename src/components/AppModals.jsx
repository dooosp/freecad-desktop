import React from 'react';
import StepImportModal from './StepImportModal.jsx';
import ShopProfileModal from './ShopProfileModal.jsx';
import ReportConfigModal from './ReportConfigModal.jsx';
import TemplateEditorModal from './TemplateEditorModal.jsx';
import ProfileCompareModal from './ProfileCompareModal.jsx';
import ExportPackModal from './ExportPackModal.jsx';

/** @param {import('../contracts/appShellContracts.js').AppModalsProps} props */
export default function AppModals({
  backend,
  configPath,
  settings,
  profiles,
  activeProfile,
  lastTemplateName,
  stepImportData,
  onUseStepConfig,
  onSaveStepConfig,
  onCloseStepImport,
  showProfileModal,
  editingProfile,
  onSaveProfile,
  onDeleteProfile,
  onCloseProfileModal,
  showReportModal,
  onGenerateReport,
  onCloseReportModal,
  onEditTemplate,
  onNewTemplate,
  showTemplateEditor,
  editingTemplate,
  onSaveTemplate,
  onDeleteTemplate,
  onCloseTemplateEditor,
  showCompareModal,
  onCloseCompareModal,
  showExportModal,
  onExportPack,
  onCloseExportModal,
}) {
  return (
    <>
      {stepImportData && (
        <StepImportModal
          data={stepImportData}
          onUseConfig={onUseStepConfig}
          onSaveConfig={onSaveStepConfig}
          onCancel={onCloseStepImport}
        />
      )}

      {showProfileModal && (
        <ShopProfileModal
          profile={editingProfile}
          onSave={onSaveProfile}
          onDelete={onDeleteProfile}
          onCancel={onCloseProfileModal}
        />
      )}

      {showReportModal && (
        <ReportConfigModal
          backend={backend}
          onGenerate={onGenerateReport}
          onCancel={onCloseReportModal}
          onEditTemplate={onEditTemplate}
          onNewTemplate={onNewTemplate}
        />
      )}

      {showTemplateEditor && (
        <TemplateEditorModal
          template={editingTemplate}
          onSave={onSaveTemplate}
          onDelete={onDeleteTemplate}
          onCancel={onCloseTemplateEditor}
        />
      )}

      {showCompareModal && (
        <ProfileCompareModal
          profiles={profiles}
          configPath={configPath}
          settings={settings}
          backend={backend}
          onCancel={onCloseCompareModal}
        />
      )}

      {showExportModal && (
        <ExportPackModal
          configPath={configPath}
          activeProfile={activeProfile}
          templateName={lastTemplateName}
          onExport={onExportPack}
          onCancel={onCloseExportModal}
        />
      )}
    </>
  );
}

import { useState, useCallback } from 'react';

export function useModalState({ backend, configPath, results, setResults, activeProfile, setViewerTab }) {
  const [showReportModal, setShowReportModal] = useState(false);
  const [lastTemplateName, setLastTemplateName] = useState(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const openReportModal = useCallback(() => {
    setShowReportModal(true);
  }, []);

  const closeReportModal = useCallback(() => {
    setShowReportModal(false);
  }, []);

  const handleGenerateReport = useCallback(async (config) => {
    if (!configPath) return;
    try {
      const data = await backend.generateReport(configPath, {
        analysisResults: results,
        templateName: config.templateName,
        profileName: activeProfile !== '_default' ? activeProfile : undefined,
        metadata: config.metadata,
        sections: config.sections,
        options: config.options,
      });
      setResults((prev) => ({ ...prev, report: data }));
      setLastTemplateName(config.templateName || null);
      setViewerTab('pdf');
      setShowReportModal(false);
    } catch {
      // error handled by backend
    }
  }, [configPath, results, activeProfile, backend, setResults, setViewerTab]);

  const handleEditTemplate = useCallback(async (name) => {
    try {
      const tpl = await backend.getReportTemplate(name);
      setEditingTemplate(tpl);
      setShowTemplateEditor(true);
    } catch {
      backend.setError('Failed to load template');
    }
  }, [backend]);

  const handleNewTemplate = useCallback(() => {
    setEditingTemplate({ _isNew: true });
    setShowTemplateEditor(true);
  }, []);

  const closeTemplateEditor = useCallback(() => {
    setShowTemplateEditor(false);
    setEditingTemplate(null);
  }, []);

  const handleSaveTemplate = useCallback(async (tpl) => {
    try {
      await backend.saveReportTemplate(tpl);
      closeTemplateEditor();
    } catch {
      backend.setError('Failed to save template');
    }
  }, [backend, closeTemplateEditor]);

  const handleDeleteTemplate = useCallback(async (name) => {
    try {
      await backend.deleteReportTemplate(name);
      closeTemplateEditor();
    } catch {
      backend.setError('Failed to delete template');
    }
  }, [backend, closeTemplateEditor]);

  const openExportModal = useCallback(() => {
    if (!configPath) return;
    setShowExportModal(true);
  }, [configPath]);

  const closeExportModal = useCallback(() => {
    setShowExportModal(false);
  }, []);

  const handleExportPack = useCallback(async (options) => {
    try {
      await backend.exportPack({
        ...options,
        analysisResults: results || {},
        reportPdfBase64: results?.report?.pdfBase64 || null,
        profileName: activeProfile !== '_default' ? activeProfile : '',
        templateName: lastTemplateName || '',
      });
      setShowExportModal(false);
    } catch {
      backend.setError('Failed to generate export pack');
    }
  }, [results, activeProfile, lastTemplateName, backend]);

  return {
    showReportModal,
    lastTemplateName,
    showTemplateEditor,
    editingTemplate,
    showExportModal,
    openReportModal,
    closeReportModal,
    handleGenerateReport,
    handleEditTemplate,
    handleNewTemplate,
    handleSaveTemplate,
    handleDeleteTemplate,
    closeTemplateEditor,
    openExportModal,
    closeExportModal,
    handleExportPack,
  };
}

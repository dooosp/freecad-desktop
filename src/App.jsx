import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useBackend } from './hooks/useBackend.js';
import FileDropZone from './components/FileDropZone.jsx';
import DfmPanel from './components/DfmPanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import StepImportModal from './components/StepImportModal.jsx';
import ShopProfilePanel from './components/ShopProfilePanel.jsx';
import ShopProfileModal from './components/ShopProfileModal.jsx';
import ReportConfigModal from './components/ReportConfigModal.jsx';
import ExportPackModal from './components/ExportPackModal.jsx';
import ProfileCompareModal from './components/ProfileCompareModal.jsx';
import TemplateEditorModal from './components/TemplateEditorModal.jsx';

// Lazy: Three.js (~600KB), Chart.js (~200KB) 컴포넌트
const ModelViewer = lazy(() => import('./components/ModelViewer.jsx'));
const DrawingViewer = lazy(() => import('./components/DrawingViewer.jsx'));
const TolerancePanel = lazy(() => import('./components/TolerancePanel.jsx'));
const CostPanel = lazy(() => import('./components/CostPanel.jsx'));
const ReportPreview = lazy(() => import('./components/ReportPreview.jsx'));

export default function App() {
  const backend = useBackend();
  const [configPath, setConfigPath] = useState(null);
  const [examples, setExamples] = useState([]);
  const [results, setResults] = useState(null);
  const [stepImportData, setStepImportData] = useState(null);
  const [viewerTab, setViewerTab] = useState('3d'); // '3d' | 'drawing' | 'pdf'
  const [analysisTab, setAnalysisTab] = useState('dfm'); // 'dfm' | 'tolerance' | 'cost'
  const [settings, setSettings] = useState({
    process: 'machining',
    material: 'SS304',
    standard: 'KS',
    batch: 100,
  });

  // Profile state
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState('_default');
  const [activeProfileData, setActiveProfileData] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);

  // Report config state
  const [showReportModal, setShowReportModal] = useState(false);
  const [lastTemplateName, setLastTemplateName] = useState(null);

  // Template editor state
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  // Export pack state
  const [showExportModal, setShowExportModal] = useState(false);

  // Profile compare state
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Project state
  const [projectName, setProjectName] = useState(null);

  useEffect(() => {
    backend.getExamples().then(ex => ex && setExamples(ex));
    backend.getProfiles().then(profs => profs && setProfiles(profs)).catch(() => setProfiles([]));
  }, []);

  // Load full profile data when activeProfile changes
  useEffect(() => {
    if (activeProfile && activeProfile !== '_default') {
      backend.getProfile(activeProfile)
        .then(data => setActiveProfileData(data))
        .catch(() => setActiveProfileData(null));
    } else {
      setActiveProfileData(null);
    }
  }, [activeProfile]);

  const restoreProject = useCallback((projectData) => {
    if (projectData.config?.path) setConfigPath(projectData.config.path);
    if (projectData.settings) setSettings(projectData.settings);
    if (projectData.profile) setActiveProfile(projectData.profile);
    if (projectData.results) setResults(projectData.results);
    if (projectData.ui?.viewerTab) setViewerTab(projectData.ui.viewerTab);
    if (projectData.ui?.analysisTab) setAnalysisTab(projectData.ui.analysisTab);
    setProjectName(projectData.name || null);
  }, []);

  const handleFileSelect = useCallback(async (path, rawFile) => {
    const lower = path.toLowerCase();
    if (lower.endsWith('.fcstudio')) {
      try {
        const { projectData } = await backend.openProject(path);
        restoreProject(projectData);
      } catch {
        // error set by backend
      }
      return;
    }
    if (lower.endsWith('.step') || lower.endsWith('.stp')) {
      try {
        const input = rawFile?.path ? rawFile.path : (rawFile || path);
        const data = await backend.importStep(input);
        setStepImportData(data);
      } catch {
        // error set by backend
      }
      return;
    }
    setConfigPath(path);
    setResults(null);
  }, [backend, restoreProject]);

  const handleAnalyze = useCallback(async () => {
    if (!configPath) return;
    setResults(null);
    try {
      const data = await backend.analyze(configPath, {
        dfm: true,
        drawing: true,
        tolerance: true,
        cost: true,
        process: settings.process,
        material: settings.material,
        batch: settings.batch,
        dxfExport: settings.dxfExport || false,
        profileName: activeProfile !== '_default' ? activeProfile : undefined,
      });
      setResults(data);
    } catch {
      // error is already set in backend.error
    }
  }, [configPath, settings, activeProfile, backend]);

  const [rerunning, setRerunning] = useState(null); // 'dfm' | 'cost' | 'drawing' | null

  const handleRerunStage = useCallback(async (stage) => {
    if (!configPath || !results) return;
    setRerunning(stage);
    backend.setError(null);
    try {
      const profileArg = activeProfile !== '_default' ? activeProfile : undefined;
      if (stage === 'dfm') {
        const data = await backend.runDfm(configPath, settings.process, profileArg);
        setResults(prev => ({ ...prev, dfm: data }));
      } else if (stage === 'cost') {
        const data = await backend.runCost(configPath, {
          process: settings.process,
          material: settings.material,
          batchSize: settings.batch,
          dfmResult: results.dfm || null,
          profileName: profileArg,
        });
        setResults(prev => ({ ...prev, cost: data }));
      } else if (stage === 'drawing') {
        const data = await backend.runDrawing(configPath);
        setResults(prev => ({
          ...prev,
          drawing: data,
          drawingSvg: data.svgContent || prev.drawingSvg,
          qa: data.qa || prev.qa,
        }));
      } else if (stage === 'tolerance') {
        const data = await backend.runTolerance(configPath);
        setResults(prev => ({ ...prev, tolerance: data }));
      }
    } catch {
      // error set by backend
    } finally {
      setRerunning(null);
    }
  }, [configPath, results, settings, activeProfile, backend]);

  const handleOpenReportConfig = useCallback(() => {
    setShowReportModal(true);
  }, []);

  const handleGenerateReportWithTemplate = useCallback(async (config) => {
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
      setResults(prev => ({ ...prev, report: data }));
      setLastTemplateName(config.templateName || null);
      setViewerTab('pdf');
      setShowReportModal(false);
    } catch {
      // error handled by backend
    }
  }, [configPath, results, activeProfile, backend]);

  // Template editor handlers
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

  const handleSaveTemplate = useCallback(async (tpl) => {
    try {
      await backend.saveReportTemplate(tpl);
      setShowTemplateEditor(false);
      setEditingTemplate(null);
    } catch {
      backend.setError('Failed to save template');
    }
  }, [backend]);

  const handleDeleteTemplate = useCallback(async (name) => {
    try {
      await backend.deleteReportTemplate(name);
      setShowTemplateEditor(false);
      setEditingTemplate(null);
    } catch {
      backend.setError('Failed to delete template');
    }
  }, [backend]);

  const handleUseStepConfig = useCallback((cfgPath) => {
    setConfigPath(cfgPath);
    setResults(null);
    setStepImportData(null);
  }, []);

  const handleSaveStepConfig = useCallback(async (cfgPath, tomlString) => {
    await backend.saveStepConfig(cfgPath, tomlString);
  }, [backend]);

  // Profile handlers
  const handleProfileChange = useCallback((name) => {
    setActiveProfile(name);
  }, []);

  const handleEditProfile = useCallback(async () => {
    try {
      const full = await backend.getProfile(activeProfile);
      setEditingProfile(full);
      setShowProfileModal(true);
    } catch (err) {
      backend.setError('Failed to load profile');
    }
  }, [activeProfile, backend]);

  const handleNewProfile = useCallback(() => {
    setEditingProfile({
      _isNew: true,
      name: '',
      description: '',
      process_capabilities: {},
      material_rates: {},
      tolerance_capabilities: {
        min_it_grade: 7,
        max_it_grade: 12,
        surface_finish_range: { min: 0.8, max: 6.3 },
      },
      inspection: {
        cost_per_tolerance_pair: 5000,
        cmm_available: true,
      },
      batch_discounts: [
        { min_qty: 1, max_qty: 10, discount: 0 },
        { min_qty: 11, max_qty: 100, discount: 0.1 },
        { min_qty: 101, max_qty: 500, discount: 0.2 },
        { min_qty: 501, max_qty: null, discount: 0.3 },
      ],
    });
    setShowProfileModal(true);
  }, []);

  const handleSaveProfile = useCallback(async (profile) => {
    try {
      await backend.saveProfile(profile);
      const updated = await backend.getProfiles();
      setProfiles(updated || []);
      setShowProfileModal(false);
    } catch (err) {
      backend.setError('Failed to save profile');
    }
  }, [backend]);

  const handleDeleteProfile = useCallback(async (name) => {
    try {
      await backend.deleteProfile(name);
      if (activeProfile === name) {
        setActiveProfile('_default');
      }
      const updated = await backend.getProfiles();
      setProfiles(updated || []);
      setShowProfileModal(false);
    } catch (err) {
      backend.setError('Failed to delete profile');
    }
  }, [activeProfile, backend]);

  // Project handlers
  const handleSaveProject = useCallback(async () => {
    const name = projectName || (configPath ? configPath.replace(/.*\//, '').replace(/\.\w+$/, '') : 'untitled');
    const projectData = {
      name,
      created: new Date().toISOString(),
      config: configPath ? { path: configPath } : null,
      settings,
      profile: activeProfile,
      results: results || null,
      ui: { viewerTab, analysisTab },
    };
    try {
      const { filename } = await backend.saveProject(projectData);
      setProjectName(name);
      backend.setError(null);
    } catch {
      // error set by backend
    }
  }, [projectName, configPath, settings, activeProfile, results, viewerTab, analysisTab, backend]);

  const handleOpenProject = useCallback(async () => {
    try {
      const recent = await backend.getRecentProjects();
      if (!recent || recent.length === 0) {
        backend.setError('No recent projects found');
        return;
      }
      // Open the most recent project
      const { projectData } = await backend.openProject(recent[0].path);
      restoreProject(projectData);
    } catch {
      // error set by backend
    }
  }, [backend, restoreProject]);

  // Export pack handlers
  const handleOpenExportPack = useCallback(() => {
    if (!configPath) return;
    setShowExportModal(true);
  }, [configPath]);

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
    } catch (err) {
      backend.setError('Failed to generate export pack');
    }
  }, [results, activeProfile, lastTemplateName, backend]);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1 className="logo">FreeCAD Studio</h1>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            disabled={backend.loading}
            onClick={handleOpenProject}
            title="Open recent project"
          >
            Open
          </button>
          <button
            className="btn btn-secondary"
            disabled={!configPath || backend.loading}
            onClick={handleSaveProject}
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
            onClick={handleAnalyze}
          >
            {backend.loading ? 'Analyzing...' : 'Analyze'}
          </button>
          <button
            className="btn btn-secondary"
            disabled={!results || backend.loading}
            onClick={handleOpenReportConfig}
          >
            Report
          </button>
          <button
            className="btn btn-secondary"
            disabled={!configPath || backend.loading}
            onClick={handleOpenExportPack}
          >
            Export Pack
          </button>
        </div>
      </header>

      {/* Progress */}
      {backend.progress && backend.progress.status !== 'done' && (
        <ProgressBar progress={backend.progress} />
      )}

      {/* Error */}
      {backend.error && (
        <div className="error-bar">
          <span className="error-message">{backend.error}</span>
          <button className="error-dismiss" onClick={() => backend.setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Main Layout */}
      <div className="main-layout">
        {/* Left Sidebar */}
        <aside className="sidebar">
          <ShopProfilePanel
            profiles={profiles}
            activeProfile={activeProfile}
            activeProfileData={activeProfileData}
            onProfileChange={handleProfileChange}
            onEditProfile={handleEditProfile}
            onNewProfile={handleNewProfile}
            onCompareProfiles={() => setShowCompareModal(true)}
          />

          <div className="sidebar-section">
            <h3>Files</h3>
            <FileDropZone onFileSelect={handleFileSelect} />
            {examples.length > 0 && (
              <div className="example-list">
                <h4>Examples</h4>
                {examples.map(ex => (
                  <button
                    key={ex}
                    className={`example-item ${configPath?.endsWith(ex) ? 'active' : ''}`}
                    onClick={() => handleFileSelect(`configs/examples/${ex}`)}
                  >
                    {ex.replace('.toml', '')}
                  </button>
                ))}
              </div>
            )}
          </div>

          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            activeProfile={activeProfileData}
            getCacheStats={backend.getCacheStats}
            clearCache={backend.clearCache}
            getDiagnostics={backend.getDiagnostics}
          />
        </aside>

        {/* Center Content */}
        <main className="content">
          {/* Viewer Tabs */}
          <div className="viewer-section">
            <div className="tab-bar">
              <button
                className={`tab ${viewerTab === '3d' ? 'active' : ''}`}
                onClick={() => setViewerTab('3d')}
              >
                3D
              </button>
              <button
                className={`tab ${viewerTab === 'drawing' ? 'active' : ''}`}
                onClick={() => setViewerTab('drawing')}
                disabled={!results?.drawingSvg}
              >
                Drawing
              </button>
              <button
                className={`tab ${viewerTab === 'pdf' ? 'active' : ''}`}
                onClick={() => setViewerTab('pdf')}
                disabled={!results?.report?.pdfBase64}
              >
                PDF
              </button>
            </div>

            <div className="viewer-content">
              <Suspense fallback={<div className="viewer-placeholder">Loading...</div>}>
                {viewerTab === '3d' && (
                  <ModelViewer stlPath={results?.model?.stl_path || results?.model?.exports?.find(e => e.format === 'stl')?.path} />
                )}
                {viewerTab === 'drawing' && results?.drawingSvg && (
                  <DrawingViewer svgContent={results.drawingSvg} qa={results.qa} />
                )}
                {viewerTab === 'pdf' && results?.report?.pdfBase64 && (
                  <ReportPreview
                    pdfBase64={results.report.pdfBase64}
                    onConfigure={handleOpenReportConfig}
                  />
                )}
              </Suspense>
            </div>
          </div>

          {/* Analysis Tabs */}
          {results && (
            <div className="analysis-section">
              <div className="tab-bar">
                <button
                  className={`tab ${analysisTab === 'dfm' ? 'active' : ''}`}
                  onClick={() => setAnalysisTab('dfm')}
                >
                  DFM
                  {results.dfm && (
                    <span className={`badge ${results.dfm.score >= 80 ? 'good' : results.dfm.score >= 60 ? 'warn' : 'bad'}`}>
                      {results.dfm.score}
                    </span>
                  )}
                </button>
                <button
                  className={`tab ${analysisTab === 'tolerance' ? 'active' : ''}`}
                  onClick={() => setAnalysisTab('tolerance')}
                  disabled={!results.tolerance}
                >
                  Tolerance
                </button>
                <button
                  className={`tab ${analysisTab === 'cost' ? 'active' : ''}`}
                  onClick={() => setAnalysisTab('cost')}
                  disabled={!results.cost}
                >
                  Cost
                </button>
                <span className="tab-spacer" />
                <button
                  className="btn-rerun"
                  disabled={rerunning !== null || backend.loading}
                  onClick={() => handleRerunStage(analysisTab)}
                  title={`Re-run ${analysisTab.toUpperCase()} only`}
                >
                  {rerunning === analysisTab ? '\u21BB ...' : '\u21BB Rerun'}
                </button>
              </div>

              <div className="analysis-content">
                {analysisTab === 'dfm' && results.dfm && (
                  <DfmPanel data={results.dfm} />
                )}
                <Suspense fallback={<div className="viewer-placeholder">Loading...</div>}>
                  {analysisTab === 'tolerance' && results.tolerance && (
                    <TolerancePanel data={results.tolerance} />
                  )}
                  {analysisTab === 'cost' && results.cost && (
                    <CostPanel data={results.cost} />
                  )}
                </Suspense>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!results && !backend.loading && (
            <div className="empty-state">
              <div className="empty-state-content">
                <div className="empty-icon">&#9881;</div>
                <h3>Ready to Analyze</h3>
                <div className="empty-steps">
                  <div className="empty-step">
                    <span className="step-num">1</span>
                    <span>Select a config or drop a STEP/TOML file</span>
                  </div>
                  <div className="empty-step">
                    <span className="step-num">2</span>
                    <span>Adjust process, material, and batch settings</span>
                  </div>
                  <div className="empty-step">
                    <span className="step-num">3</span>
                    <span>Click <strong>Analyze</strong> to run the full pipeline</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* STEP Import Modal */}
      {stepImportData && (
        <StepImportModal
          data={stepImportData}
          onUseConfig={handleUseStepConfig}
          onSaveConfig={handleSaveStepConfig}
          onCancel={() => setStepImportData(null)}
        />
      )}

      {/* Shop Profile Modal */}
      {showProfileModal && (
        <ShopProfileModal
          profile={editingProfile}
          onSave={handleSaveProfile}
          onDelete={handleDeleteProfile}
          onCancel={() => setShowProfileModal(false)}
        />
      )}

      {/* Report Config Modal */}
      {showReportModal && (
        <ReportConfigModal
          backend={backend}
          onGenerate={handleGenerateReportWithTemplate}
          onCancel={() => setShowReportModal(false)}
          onEditTemplate={handleEditTemplate}
          onNewTemplate={handleNewTemplate}
        />
      )}

      {/* Template Editor Modal */}
      {showTemplateEditor && (
        <TemplateEditorModal
          template={editingTemplate}
          onSave={handleSaveTemplate}
          onDelete={handleDeleteTemplate}
          onCancel={() => { setShowTemplateEditor(false); setEditingTemplate(null); }}
        />
      )}

      {/* Profile Compare Modal */}
      {showCompareModal && (
        <ProfileCompareModal
          profiles={profiles}
          configPath={configPath}
          settings={settings}
          backend={backend}
          onCancel={() => setShowCompareModal(false)}
        />
      )}

      {/* Export Pack Modal */}
      {showExportModal && (
        <ExportPackModal
          configPath={configPath}
          activeProfile={activeProfile}
          templateName={lastTemplateName}
          onExport={handleExportPack}
          onCancel={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

import React, { lazy, Suspense } from 'react';
import FileDropZone from './FileDropZone.jsx';
import DfmPanel from './DfmPanel.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import ShopProfilePanel from './ShopProfilePanel.jsx';

const ModelViewer = lazy(() => import('./ModelViewer.jsx'));
const DrawingViewer = lazy(() => import('./DrawingViewer.jsx'));
const TolerancePanel = lazy(() => import('./TolerancePanel.jsx'));
const CostPanel = lazy(() => import('./CostPanel.jsx'));
const ReportPreview = lazy(() => import('./ReportPreview.jsx'));

/** @param {import('../contracts/appShellContracts.js').AppMainLayoutProps} props */
export default function AppMainLayout({
  backend,
  profiles,
  activeProfile,
  activeProfileData,
  onProfileChange,
  onEditProfile,
  onNewProfile,
  onCompareProfiles,
  onFileSelect,
  examples,
  configPath,
  settings,
  onSettingsChange,
  results,
  viewerTab,
  onViewerTabChange,
  analysisTab,
  onAnalysisTabChange,
  rerunning,
  onRerunStage,
  onOpenReportConfig,
}) {
  return (
    <div className="main-layout">
      <aside className="sidebar">
        <ShopProfilePanel
          profiles={profiles}
          activeProfile={activeProfile}
          activeProfileData={activeProfileData}
          onProfileChange={onProfileChange}
          onEditProfile={onEditProfile}
          onNewProfile={onNewProfile}
          onCompareProfiles={onCompareProfiles}
        />

        <div className="sidebar-section">
          <h3>Files</h3>
          <FileDropZone onFileSelect={onFileSelect} />
          {examples.length > 0 && (
            <div className="example-list">
              <h4>Examples</h4>
              {examples.map((ex) => (
                <button
                  key={ex}
                  className={`example-item ${configPath?.endsWith(ex) ? 'active' : ''}`}
                  onClick={() => onFileSelect(`configs/examples/${ex}`)}
                >
                  {ex.replace('.toml', '')}
                </button>
              ))}
            </div>
          )}
        </div>

        <SettingsPanel
          settings={settings}
          onChange={onSettingsChange}
          activeProfile={activeProfileData}
          getCacheStats={backend.getCacheStats}
          clearCache={backend.clearCache}
          getDiagnostics={backend.getDiagnostics}
        />
      </aside>

      <main className="content">
        <div className="viewer-section">
          <div className="tab-bar">
            <button
              className={`tab ${viewerTab === '3d' ? 'active' : ''}`}
              onClick={() => onViewerTabChange('3d')}
            >
              3D
            </button>
            <button
              className={`tab ${viewerTab === 'drawing' ? 'active' : ''}`}
              onClick={() => onViewerTabChange('drawing')}
              disabled={!results?.drawingSvg}
            >
              Drawing
            </button>
            <button
              className={`tab ${viewerTab === 'pdf' ? 'active' : ''}`}
              onClick={() => onViewerTabChange('pdf')}
              disabled={!results?.report?.pdfBase64}
            >
              PDF
            </button>
          </div>

          <div className="viewer-content">
            <Suspense fallback={<div className="viewer-placeholder">Loading...</div>}>
              {viewerTab === '3d' && (
                <ModelViewer stlPath={results?.model?.stl_path || results?.model?.exports?.find((e) => e.format === 'stl')?.path} />
              )}
              {viewerTab === 'drawing' && results?.drawingSvg && (
                <DrawingViewer svgContent={results.drawingSvg} qa={results.qa} />
              )}
              {viewerTab === 'pdf' && results?.report?.pdfBase64 && (
                <ReportPreview
                  pdfBase64={results.report.pdfBase64}
                  onConfigure={onOpenReportConfig}
                />
              )}
            </Suspense>
          </div>
        </div>

        {results && (
          <div className="analysis-section">
            <div className="tab-bar">
              <button
                className={`tab ${analysisTab === 'dfm' ? 'active' : ''}`}
                onClick={() => onAnalysisTabChange('dfm')}
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
                onClick={() => onAnalysisTabChange('tolerance')}
                disabled={!results.tolerance}
              >
                Tolerance
              </button>
              <button
                className={`tab ${analysisTab === 'cost' ? 'active' : ''}`}
                onClick={() => onAnalysisTabChange('cost')}
                disabled={!results.cost}
              >
                Cost
              </button>
              <span className="tab-spacer" />
              <button
                className="btn-rerun"
                disabled={rerunning !== null || backend.loading}
                onClick={() => onRerunStage(analysisTab)}
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
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useBackend } from './hooks/useBackend.js';
import FileDropZone from './components/FileDropZone.jsx';
import ModelViewer from './components/ModelViewer.jsx';
import DrawingViewer from './components/DrawingViewer.jsx';
import DfmPanel from './components/DfmPanel.jsx';
import TolerancePanel from './components/TolerancePanel.jsx';
import CostPanel from './components/CostPanel.jsx';
import ReportPreview from './components/ReportPreview.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import ProgressBar from './components/ProgressBar.jsx';

export default function App() {
  const backend = useBackend();
  const [configPath, setConfigPath] = useState(null);
  const [examples, setExamples] = useState([]);
  const [results, setResults] = useState(null);
  const [viewerTab, setViewerTab] = useState('3d'); // '3d' | 'drawing' | 'pdf'
  const [analysisTab, setAnalysisTab] = useState('dfm'); // 'dfm' | 'tolerance' | 'cost'
  const [settings, setSettings] = useState({
    process: 'machining',
    material: 'SS304',
    standard: 'KS',
    batch: 100,
  });
  const [analyzeStage, setAnalyzeStage] = useState(null);

  useEffect(() => {
    backend.getExamples().then(ex => ex && setExamples(ex));
  }, []);

  const handleFileSelect = useCallback((path) => {
    setConfigPath(path);
    setResults(null);
    setAnalyzeStage(null);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!configPath) return;
    setResults(null);
    setAnalyzeStage('analyzing');
    try {
      const data = await backend.analyze(configPath, {
        dfm: true,
        drawing: true,
        tolerance: true,
        cost: true,
        process: settings.process,
        material: settings.material,
        batch: settings.batch,
      });
      setResults(data);
      setAnalyzeStage('done');
    } catch {
      setAnalyzeStage('error');
    }
  }, [configPath, settings, backend]);

  const handleGenerateReport = useCallback(async () => {
    if (!configPath) return;
    setAnalyzeStage('report');
    try {
      const data = await backend.generateReport(configPath, {
        analysisResults: results,
      });
      setResults(prev => ({ ...prev, report: data }));
      setViewerTab('pdf');
      setAnalyzeStage('done');
    } catch {
      setAnalyzeStage('error');
    }
  }, [configPath, results, backend]);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1 className="logo">FreeCAD Studio</h1>
        </div>
        <div className="header-actions">
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
            onClick={handleGenerateReport}
          >
            Report
          </button>
        </div>
      </header>

      {/* Progress */}
      {backend.loading && (
        <ProgressBar stage={analyzeStage} stages={results?.stages} />
      )}

      {/* Error */}
      {backend.error && (
        <div className="error-bar" onClick={() => backend.setError(null)}>
          {backend.error}
        </div>
      )}

      {/* Main Layout */}
      <div className="main-layout">
        {/* Left Sidebar */}
        <aside className="sidebar">
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

          <SettingsPanel settings={settings} onChange={setSettings} />
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
              {viewerTab === '3d' && (
                <ModelViewer stlPath={results?.model?.stl_path} />
              )}
              {viewerTab === 'drawing' && results?.drawingSvg && (
                <DrawingViewer svgContent={results.drawingSvg} qa={results.qa} />
              )}
              {viewerTab === 'pdf' && results?.report?.pdfBase64 && (
                <ReportPreview pdfBase64={results.report.pdfBase64} />
              )}
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
              </div>

              <div className="analysis-content">
                {analysisTab === 'dfm' && results.dfm && (
                  <DfmPanel data={results.dfm} />
                )}
                {analysisTab === 'tolerance' && results.tolerance && (
                  <TolerancePanel data={results.tolerance} />
                )}
                {analysisTab === 'cost' && results.cost && (
                  <CostPanel data={results.cost} />
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!results && !backend.loading && (
            <div className="empty-state">
              <p>Select a config file or drag & drop a STEP/TOML file to begin.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

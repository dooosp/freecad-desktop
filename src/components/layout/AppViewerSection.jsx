import React, { lazy, Suspense } from 'react';
import { useAppShell } from '../../contexts/AppShellContext.jsx';

const ModelViewer = lazy(() => import('../ModelViewer.jsx'));
const DrawingViewer = lazy(() => import('../DrawingViewer.jsx'));
const ReportPreview = lazy(() => import('../ReportPreview.jsx'));

export default function AppViewerSection() {
  const { projectState, modalState } = useAppShell();

  return (
    <div className="viewer-section">
      <div className="tab-bar">
        <button
          className={`tab ${projectState.viewerTab === '3d' ? 'active' : ''}`}
          onClick={() => projectState.setViewerTab('3d')}
        >
          3D
        </button>
        <button
          className={`tab ${projectState.viewerTab === 'drawing' ? 'active' : ''}`}
          onClick={() => projectState.setViewerTab('drawing')}
          disabled={!projectState.results?.drawingSvg}
        >
          Drawing
        </button>
        <button
          className={`tab ${projectState.viewerTab === 'pdf' ? 'active' : ''}`}
          onClick={() => projectState.setViewerTab('pdf')}
          disabled={!projectState.results?.report?.pdfBase64}
        >
          PDF
        </button>
      </div>

      <div className="viewer-content">
        <Suspense fallback={<div className="viewer-placeholder">Loading...</div>}>
          {projectState.viewerTab === '3d' && (
            <ModelViewer
              stlPath={projectState.results?.model?.stl_path || projectState.results?.model?.exports?.find((e) => e.format === 'stl')?.path}
            />
          )}
          {projectState.viewerTab === 'drawing' && projectState.results?.drawingSvg && (
            <DrawingViewer svgContent={projectState.results.drawingSvg} qa={projectState.results.qa} />
          )}
          {projectState.viewerTab === 'pdf' && projectState.results?.report?.pdfBase64 && (
            <ReportPreview
              pdfBase64={projectState.results.report.pdfBase64}
              onConfigure={modalState.openReportModal}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}

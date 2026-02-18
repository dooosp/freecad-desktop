import React, { lazy, Suspense } from 'react';
import DfmPanel from '../DfmPanel.jsx';
import { useAppShell } from '../../contexts/AppShellContext.jsx';

const TolerancePanel = lazy(() => import('../TolerancePanel.jsx'));
const CostPanel = lazy(() => import('../CostPanel.jsx'));
const AiDesignPanel = lazy(() => import('../AiDesignPanel.jsx'));
const FemPanel = lazy(() => import('../FemPanel.jsx'));

export default function AppAnalysisSection() {
  const { backend, projectState } = useAppShell();

  return (
    <div className="analysis-section">
      <div className="tab-bar">
        <button
          className={`tab ${projectState.analysisTab === 'dfm' ? 'active' : ''}`}
          onClick={() => projectState.setAnalysisTab('dfm')}
        >
          DFM
          {projectState.results?.dfm && (
            <span className={`badge ${projectState.results.dfm.score >= 80 ? 'good' : projectState.results.dfm.score >= 60 ? 'warn' : 'bad'}`}>
              {projectState.results.dfm.score}
            </span>
          )}
        </button>
        <button
          className={`tab ${projectState.analysisTab === 'tolerance' ? 'active' : ''}`}
          onClick={() => projectState.setAnalysisTab('tolerance')}
          disabled={!projectState.results?.tolerance}
        >
          Tolerance
        </button>
        <button
          className={`tab ${projectState.analysisTab === 'cost' ? 'active' : ''}`}
          onClick={() => projectState.setAnalysisTab('cost')}
          disabled={!projectState.results?.cost}
        >
          Cost
        </button>
        <button
          className={`tab ${projectState.analysisTab === 'ai-design' ? 'active' : ''}`}
          onClick={() => projectState.setAnalysisTab('ai-design')}
        >
          AI Design
        </button>
        <button
          className={`tab ${projectState.analysisTab === 'fem' ? 'active' : ''}`}
          onClick={() => projectState.setAnalysisTab('fem')}
          disabled={!projectState.configPath}
        >
          FEM
        </button>
        <span className="tab-spacer" />
        <button
          className="btn-rerun"
          disabled={projectState.rerunning !== null || backend.loading}
          onClick={() => projectState.handleRerunStage(projectState.analysisTab)}
          title={`Re-run ${projectState.analysisTab.toUpperCase()} only`}
        >
          {projectState.rerunning === projectState.analysisTab ? '\u21BB ...' : '\u21BB Rerun'}
        </button>
      </div>

      <div className="analysis-content">
        {projectState.analysisTab === 'dfm' && projectState.results?.dfm && (
          <DfmPanel data={projectState.results.dfm} />
        )}
        <Suspense fallback={<div className="viewer-placeholder">Loading...</div>}>
          {projectState.analysisTab === 'tolerance' && projectState.results?.tolerance && (
            <TolerancePanel data={projectState.results.tolerance} />
          )}
          {projectState.analysisTab === 'cost' && projectState.results?.cost && (
            <CostPanel data={projectState.results.cost} />
          )}
          {projectState.analysisTab === 'ai-design' && (
            <AiDesignPanel backend={backend} />
          )}
          {projectState.analysisTab === 'fem' && (
            <FemPanel backend={backend} configPath={projectState.configPath} />
          )}
        </Suspense>
      </div>
    </div>
  );
}

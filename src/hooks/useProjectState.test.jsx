import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useProjectState } from './useProjectState.js';

function createBackendMock(overrides = {}) {
  return {
    getExamples: vi.fn().mockResolvedValue(['ks_flange.toml']),
    openProject: vi.fn(),
    importStep: vi.fn(),
    analyze: vi.fn(),
    runDfm: vi.fn(),
    runCost: vi.fn(),
    runDrawing: vi.fn(),
    runTolerance: vi.fn(),
    saveStepConfig: vi.fn().mockResolvedValue({ success: true }),
    saveProject: vi.fn().mockResolvedValue({ filename: 'saved.fcstudio' }),
    getRecentProjects: vi.fn().mockResolvedValue([]),
    setError: vi.fn(),
    ...overrides,
  };
}

describe('useProjectState', () => {
  it('restores state from .fcstudio file open', async () => {
    const backend = createBackendMock({
      openProject: vi.fn().mockResolvedValue({
        projectData: {
          name: 'restored-project',
          config: { path: 'configs/examples/ks_flange.toml' },
          settings: { process: 'machining', material: 'AL6061', standard: 'KS', batch: 42 },
          profile: 'sample_precision',
          results: { dfm: { score: 88 } },
          ui: { viewerTab: 'drawing', analysisTab: 'cost' },
        },
      }),
    });
    const setActiveProfile = vi.fn();

    const { result } = renderHook(() => useProjectState({
      backend,
      activeProfile: '_default',
      setActiveProfile,
    }));

    await waitFor(() => {
      expect(backend.getExamples).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.handleFileSelect('/tmp/sample.fcstudio');
    });

    expect(backend.openProject).toHaveBeenCalledWith('/tmp/sample.fcstudio');
    expect(setActiveProfile).toHaveBeenCalledWith('sample_precision');
    expect(result.current.configPath).toBe('configs/examples/ks_flange.toml');
    expect(result.current.settings.material).toBe('AL6061');
    expect(result.current.viewerTab).toBe('drawing');
    expect(result.current.analysisTab).toBe('cost');
    expect(result.current.results).toEqual({ dfm: { score: 88 } });
  });

  it('opens most recent project and restores state', async () => {
    const backend = createBackendMock({
      getRecentProjects: vi.fn().mockResolvedValue([{ path: '/tmp/recent.fcstudio' }]),
      openProject: vi.fn().mockResolvedValue({
        projectData: {
          name: 'recent-project',
          config: { path: 'configs/examples/ks_bracket.toml' },
          settings: { process: 'casting', material: 'SS304', standard: 'KS', batch: 10 },
          profile: '_default',
          results: { cost: { unit_cost: 1000 } },
          ui: { viewerTab: 'pdf', analysisTab: 'dfm' },
        },
      }),
    });

    const { result } = renderHook(() => useProjectState({
      backend,
      activeProfile: '_default',
      setActiveProfile: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleOpenProject();
    });

    expect(backend.getRecentProjects).toHaveBeenCalledTimes(1);
    expect(backend.openProject).toHaveBeenCalledWith('/tmp/recent.fcstudio');
    expect(result.current.configPath).toBe('configs/examples/ks_bracket.toml');
    expect(result.current.viewerTab).toBe('pdf');
  });

  it('sets explicit error when no recent projects exist', async () => {
    const backend = createBackendMock({
      getRecentProjects: vi.fn().mockResolvedValue([]),
    });

    const { result } = renderHook(() => useProjectState({
      backend,
      activeProfile: '_default',
      setActiveProfile: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleOpenProject();
    });

    expect(backend.openProject).not.toHaveBeenCalled();
    expect(backend.setError).toHaveBeenCalledWith('No recent projects found');
  });

  it('saves project payload with restored app state', async () => {
    const backend = createBackendMock();

    const { result } = renderHook(() => useProjectState({
      backend,
      activeProfile: 'sample_precision',
      setActiveProfile: vi.fn(),
    }));

    await waitFor(() => {
      expect(backend.getExamples).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.handleUseStepConfig('configs/examples/ks_flange.toml');
      result.current.setViewerTab('drawing');
      result.current.setAnalysisTab('cost');
      result.current.setResults({
        model: { ok: true },
        dfm: { score: 90 },
      });
    });

    await act(async () => {
      await result.current.handleSaveProject();
    });

    expect(backend.saveProject).toHaveBeenCalledTimes(1);
    expect(backend.saveProject).toHaveBeenCalledWith(expect.objectContaining({
      name: 'ks_flange',
      config: { path: 'configs/examples/ks_flange.toml' },
      profile: 'sample_precision',
      ui: { viewerTab: 'drawing', analysisTab: 'cost' },
    }));
    expect(backend.setError).toHaveBeenCalledWith(null);
  });

  it('handles STEP import flow and plain config selection', async () => {
    const backend = createBackendMock({
      importStep: vi.fn().mockResolvedValue({ configPath: 'configs/imports/part.toml', analysis: { ok: true } }),
    });

    const { result } = renderHook(() => useProjectState({
      backend,
      activeProfile: '_default',
      setActiveProfile: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleFileSelect('/tmp/part.step', { path: '/tmp/raw-part.step' });
    });
    expect(backend.importStep).toHaveBeenCalledWith('/tmp/raw-part.step');
    expect(result.current.stepImportData).toEqual({ configPath: 'configs/imports/part.toml', analysis: { ok: true } });

    act(() => {
      result.current.setResults({ dfm: { score: 90 } });
    });
    await act(async () => {
      await result.current.handleFileSelect('/tmp/configs/ks_flange.toml');
    });
    expect(result.current.configPath).toBe('/tmp/configs/ks_flange.toml');
    expect(result.current.results).toBeNull();
  });

  it('analyze uses settings/profile and updates results', async () => {
    const backend = createBackendMock({
      analyze: vi.fn().mockResolvedValue({ dfm: { score: 91 }, cost: { unit_cost: 1500 } }),
    });

    const { result } = renderHook(() => useProjectState({
      backend,
      activeProfile: 'sample_precision',
      setActiveProfile: vi.fn(),
    }));

    act(() => {
      result.current.handleUseStepConfig('configs/examples/ks_flange.toml');
      result.current.setSettings({
        process: 'casting',
        material: 'AL6061',
        standard: 'KS',
        batch: 25,
        dxfExport: true,
      });
    });

    await act(async () => {
      await result.current.handleAnalyze();
    });

    expect(backend.analyze).toHaveBeenCalledWith('configs/examples/ks_flange.toml', expect.objectContaining({
      process: 'casting',
      material: 'AL6061',
      batch: 25,
      dxfExport: true,
      profileName: 'sample_precision',
    }));
    expect(result.current.results).toEqual({ dfm: { score: 91 }, cost: { unit_cost: 1500 } });
  });

  it('reruns each stage and merges stage-specific result fields', async () => {
    const backend = createBackendMock({
      runDfm: vi.fn().mockResolvedValue({ score: 80 }),
      runCost: vi.fn().mockResolvedValue({ unit_cost: 1234 }),
      runDrawing: vi.fn().mockResolvedValue({ svgContent: '<svg rerun />', qa: { score: 85 } }),
      runTolerance: vi.fn().mockResolvedValue({ fit: 'H7/g6' }),
    });

    const { result } = renderHook(() => useProjectState({
      backend,
      activeProfile: '_default',
      setActiveProfile: vi.fn(),
    }));

    act(() => {
      result.current.handleUseStepConfig('configs/examples/ks_flange.toml');
      result.current.setResults({
        dfm: { score: 60 },
        cost: { unit_cost: 9999 },
        drawing: { drawing_paths: [{ format: 'svg', path: 'output/original.svg' }] },
        drawingSvg: '<svg old />',
        qa: { score: 10 },
      });
    });

    await act(async () => {
      await result.current.handleRerunStage('dfm');
      await result.current.handleRerunStage('cost');
      await result.current.handleRerunStage('drawing');
      await result.current.handleRerunStage('tolerance');
    });

    expect(backend.setError).toHaveBeenCalledWith(null);
    expect(backend.runDfm).toHaveBeenCalledWith('configs/examples/ks_flange.toml', 'machining', undefined, 'KS');
    expect(backend.runCost).toHaveBeenCalledWith('configs/examples/ks_flange.toml', expect.objectContaining({
      process: 'machining',
      material: 'SS304',
      batchSize: 100,
      profileName: undefined,
      standard: 'KS',
    }));
    expect(backend.runDrawing).toHaveBeenCalledWith('configs/examples/ks_flange.toml', undefined, 'KS');
    expect(backend.runTolerance).toHaveBeenCalledWith('configs/examples/ks_flange.toml', 'KS');

    expect(result.current.results.dfm).toEqual({ score: 80 });
    expect(result.current.results.cost).toEqual({ unit_cost: 1234 });
    expect(result.current.results.drawingSvg).toBe('<svg rerun />');
    expect(result.current.results.qa).toEqual({ score: 85 });
    expect(result.current.results.tolerance).toEqual({ fit: 'H7/g6' });
    expect(result.current.rerunning).toBeNull();
  });

  it('saveStepConfig delegates backend call', async () => {
    const backend = createBackendMock();
    const { result } = renderHook(() => useProjectState({
      backend,
      activeProfile: '_default',
      setActiveProfile: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleSaveStepConfig('configs/imports/from-step.toml', 'name = "step_part"');
    });
    expect(backend.saveStepConfig).toHaveBeenCalledWith('configs/imports/from-step.toml', 'name = "step_part"');
  });
});

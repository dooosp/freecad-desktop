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
});

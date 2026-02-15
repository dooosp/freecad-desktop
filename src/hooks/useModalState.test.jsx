import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { formatExportPackError, useModalState } from './useModalState.js';

function createBackendMock(overrides = {}) {
  return {
    generateReport: vi.fn().mockResolvedValue({ pdfBase64: 'report-pdf' }),
    getReportTemplate: vi.fn().mockResolvedValue({ name: 'tpl-a', label: 'Template A' }),
    saveReportTemplate: vi.fn().mockResolvedValue({ success: true }),
    deleteReportTemplate: vi.fn().mockResolvedValue({ success: true }),
    exportPack: vi.fn().mockResolvedValue({ success: true }),
    setError: vi.fn(),
    ...overrides,
  };
}

describe('useModalState', () => {
  it('maps raw export errors to actionable user messages', () => {
    expect(formatExportPackError(new Error('configPath required'))).toBe(
      'Select a valid config before exporting. Re-open the part and try again.'
    );
    expect(formatExportPackError(new Error('ENOENT: no such file or directory'))).toBe(
      'Some required output files are missing. Run Analyze and Report again, then retry export.'
    );
    expect(formatExportPackError(new Error('ECONNREFUSED 127.0.0.1:8080'))).toBe(
      'Export service is temporarily unavailable. Wait a moment and retry.'
    );
    expect(formatExportPackError(new Error('random issue'))).toBe(
      'Export package generation failed. Check inputs and retry.'
    );
  });

  it('generates report and updates report/viewer/modal state', async () => {
    const backend = createBackendMock();
    const setResults = vi.fn();
    const setViewerTab = vi.fn();

    const { result } = renderHook(() => useModalState({
      backend,
      configPath: 'configs/examples/ks_flange.toml',
      results: { dfm: { score: 90 } },
      setResults,
      activeProfile: 'sample_precision',
      setViewerTab,
    }));

    act(() => {
      result.current.openReportModal();
    });
    expect(result.current.showReportModal).toBe(true);

    await act(async () => {
      await result.current.handleGenerateReport({
        templateName: 'tpl-a',
        metadata: { part_name: 'P1' },
        sections: { dfm: true },
        options: { language: 'ko' },
      });
    });

    expect(backend.generateReport).toHaveBeenCalledWith(
      'configs/examples/ks_flange.toml',
      expect.objectContaining({
        templateName: 'tpl-a',
        profileName: 'sample_precision',
      })
    );

    const updater = setResults.mock.calls[0][0];
    expect(updater({ dfm: { score: 90 } })).toEqual({
      dfm: { score: 90 },
      report: { pdfBase64: 'report-pdf' },
    });

    expect(setViewerTab).toHaveBeenCalledWith('pdf');
    expect(result.current.lastTemplateName).toBe('tpl-a');
    expect(result.current.showReportModal).toBe(false);
  });

  it('supports template edit/new/save/delete lifecycle', async () => {
    const backend = createBackendMock();

    const { result } = renderHook(() => useModalState({
      backend,
      configPath: 'configs/examples/ks_flange.toml',
      results: {},
      setResults: vi.fn(),
      activeProfile: '_default',
      setViewerTab: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleEditTemplate('tpl-a');
    });
    expect(backend.getReportTemplate).toHaveBeenCalledWith('tpl-a');
    expect(result.current.showTemplateEditor).toBe(true);
    expect(result.current.editingTemplate?.name).toBe('tpl-a');

    await act(async () => {
      await result.current.handleSaveTemplate({ name: 'tpl-a' });
    });
    expect(backend.saveReportTemplate).toHaveBeenCalledWith({ name: 'tpl-a' });
    expect(result.current.showTemplateEditor).toBe(false);
    expect(result.current.editingTemplate).toBe(null);

    act(() => {
      result.current.handleNewTemplate();
    });
    expect(result.current.showTemplateEditor).toBe(true);
    expect(result.current.editingTemplate?._isNew).toBe(true);

    await act(async () => {
      await result.current.handleDeleteTemplate('tpl-a');
    });
    expect(backend.deleteReportTemplate).toHaveBeenCalledWith('tpl-a');
    expect(result.current.showTemplateEditor).toBe(false);
  });

  it('guards export modal open when configPath is missing', () => {
    const backend = createBackendMock();

    const { result } = renderHook(() => useModalState({
      backend,
      configPath: null,
      results: {},
      setResults: vi.fn(),
      activeProfile: '_default',
      setViewerTab: vi.fn(),
    }));

    act(() => {
      result.current.openExportModal();
    });

    expect(result.current.showExportModal).toBe(false);
  });

  it('exports pack with merged analysis/report/profile/template values', async () => {
    const backend = createBackendMock();
    let currentResults = { dfm: { score: 80 } };
    const setResults = vi.fn((updater) => {
      currentResults = typeof updater === 'function' ? updater(currentResults) : updater;
    });

    const setViewerTab = vi.fn();
    const makeProps = () => ({
      backend,
      configPath: 'configs/examples/ks_flange.toml',
      results: currentResults,
      setResults,
      activeProfile: 'sample_precision',
      setViewerTab,
    });

    const { result, rerender } = renderHook((props) => useModalState(props), {
      initialProps: makeProps(),
    });

    await act(async () => {
      await result.current.handleGenerateReport({
        templateName: 'tpl-export',
        metadata: {},
        sections: {},
        options: {},
      });
    });
    rerender(makeProps());

    act(() => {
      result.current.openExportModal();
    });
    expect(result.current.showExportModal).toBe(true);

    let exportResponse;
    await act(async () => {
      exportResponse = await result.current.handleExportPack({
        configPath: 'configs/examples/ks_flange.toml',
        include: { report: true },
      });
    });

    expect(exportResponse).toEqual({ success: true });
    expect(backend.exportPack).toHaveBeenCalledWith(expect.objectContaining({
      analysisResults: currentResults,
      reportPdfBase64: 'report-pdf',
      profileName: 'sample_precision',
      templateName: 'tpl-export',
    }));
    expect(backend.setError).toHaveBeenCalledWith(null);
    expect(result.current.showExportModal).toBe(true);
  });

  it('surfaces template load failure through backend error state', async () => {
    const backend = createBackendMock({
      getReportTemplate: vi.fn().mockRejectedValue(new Error('template load failed')),
    });

    const { result } = renderHook(() => useModalState({
      backend,
      configPath: 'configs/examples/ks_flange.toml',
      results: {},
      setResults: vi.fn(),
      activeProfile: '_default',
      setViewerTab: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleEditTemplate('tpl-a');
    });

    expect(backend.setError).toHaveBeenCalledWith('Failed to load template');
  });

  it('surfaces export failure and keeps export modal open', async () => {
    const backend = createBackendMock({
      exportPack: vi.fn().mockRejectedValue(new Error('ENOENT: no such file or directory')),
    });

    const { result } = renderHook(() => useModalState({
      backend,
      configPath: 'configs/examples/ks_flange.toml',
      results: { report: { pdfBase64: 'pdf' } },
      setResults: vi.fn(),
      activeProfile: '_default',
      setViewerTab: vi.fn(),
    }));

    act(() => {
      result.current.openExportModal();
    });

    let caught;
    await act(async () => {
      try {
        await result.current.handleExportPack({
          configPath: 'configs/examples/ks_flange.toml',
          include: { report: true },
        });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBeTruthy();
    expect(caught.message).toBe('Some required output files are missing. Run Analyze and Report again, then retry export.');
    expect(backend.setError).toHaveBeenCalledWith(
      'Some required output files are missing. Run Analyze and Report again, then retry export.'
    );
    expect(result.current.showExportModal).toBe(true);
  });
});

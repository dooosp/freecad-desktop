import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { useAppShellMock } = vi.hoisted(() => ({
  useAppShellMock: vi.fn(),
}));

vi.mock('../../contexts/AppShellContext.jsx', () => ({
  useAppShell: useAppShellMock,
}));

vi.mock('../ModelViewer.jsx', () => ({
  default: ({ stlPath }) => <div data-testid="model-viewer-stub">{stlPath || 'no-stl'}</div>,
}));

vi.mock('../DrawingViewer.jsx', () => ({
  default: ({ svgContent, qa }) => (
    <div data-testid="drawing-viewer-stub">
      {svgContent}|{qa?.score ?? 'na'}
    </div>
  ),
}));

vi.mock('../ReportPreview.jsx', () => ({
  default: ({ pdfBase64, onConfigure }) => (
    <button data-testid="report-preview-stub" onClick={onConfigure}>
      {pdfBase64}
    </button>
  ),
}));

import AppViewerSection from './AppViewerSection.jsx';

function createShell(overrides = {}) {
  return {
    projectState: {
      viewerTab: '3d',
      setViewerTab: vi.fn(),
      results: {
        model: { stl_path: 'output/model.stl' },
      },
      ...(overrides.projectState || {}),
    },
    modalState: {
      openReportModal: vi.fn(),
      ...(overrides.modalState || {}),
    },
  };
}

describe('AppViewerSection', () => {
  beforeEach(() => {
    useAppShellMock.mockReset();
  });

  it('renders 3D viewer and forwards tab click handlers', async () => {
    const shell = createShell({
      projectState: {
        results: {
          model: { stl_path: 'output/model.stl' },
          drawingSvg: '<svg/>',
          report: { pdfBase64: 'dGVzdA==' },
        },
      },
    });
    useAppShellMock.mockReturnValue(shell);

    render(<AppViewerSection />);

    expect((await screen.findByTestId('model-viewer-stub')).textContent).toContain('output/model.stl');
    fireEvent.click(screen.getByRole('button', { name: 'Drawing' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(shell.projectState.setViewerTab).toHaveBeenCalledWith('drawing');
    expect(shell.projectState.setViewerTab).toHaveBeenCalledWith('pdf');
  });

  it('renders drawing/pdf tabs with disabled states and lazy content', async () => {
    let shell = createShell({
      projectState: {
        viewerTab: 'drawing',
        results: {
          drawingSvg: '<svg/>',
          qa: { score: 88 },
        },
      },
    });
    useAppShellMock.mockImplementation(() => shell);
    const { rerender } = render(<AppViewerSection />);

    expect((await screen.findByTestId('drawing-viewer-stub')).textContent).toContain('<svg/>|88');
    expect(screen.getByRole('button', { name: 'Drawing' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'PDF' }).hasAttribute('disabled')).toBe(true);

    shell = createShell({
      projectState: {
        viewerTab: 'pdf',
        results: {
          report: { pdfBase64: 'dGVzdA==' },
        },
      },
    });
    rerender(<AppViewerSection />);

    const report = await screen.findByTestId('report-preview-stub');
    expect(report.textContent).toContain('dGVzdA==');
    fireEvent.click(report);
    expect(shell.modalState.openReportModal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Drawing' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'PDF' }).hasAttribute('disabled')).toBe(false);
  });
});

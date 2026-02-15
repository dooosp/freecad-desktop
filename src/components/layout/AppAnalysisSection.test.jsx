import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { useAppShellMock } = vi.hoisted(() => ({
  useAppShellMock: vi.fn(),
}));

vi.mock('../../contexts/AppShellContext.jsx', () => ({
  useAppShell: useAppShellMock,
}));

vi.mock('../DfmPanel.jsx', () => ({
  default: ({ data }) => <div data-testid="dfm-panel-stub">dfm:{data?.score}</div>,
}));

vi.mock('../TolerancePanel.jsx', () => ({
  default: ({ data }) => <div data-testid="tol-panel-stub">tol:{data?.fits?.length || 0}</div>,
}));

vi.mock('../CostPanel.jsx', () => ({
  default: ({ data }) => <div data-testid="cost-panel-stub">cost:{data?.total_cost ?? 0}</div>,
}));

import AppAnalysisSection from './AppAnalysisSection.jsx';

function createShell(overrides = {}) {
  return {
    backend: {
      loading: false,
      ...(overrides.backend || {}),
    },
    projectState: {
      analysisTab: 'dfm',
      setAnalysisTab: vi.fn(),
      handleRerunStage: vi.fn(),
      rerunning: null,
      results: {
        dfm: { score: 86 },
        tolerance: { fits: [{ bore: 'B1', shaft: 'S1' }] },
        cost: { total_cost: 123456 },
      },
      ...(overrides.projectState || {}),
    },
  };
}

describe('AppAnalysisSection', () => {
  beforeEach(() => {
    useAppShellMock.mockReset();
  });

  it('renders DFM badge/panel and triggers rerun for active tab', async () => {
    const shell = createShell();
    useAppShellMock.mockReturnValue(shell);
    const { container } = render(<AppAnalysisSection />);

    const dfmTab = screen.getByRole('button', { name: /DFM/i });
    expect(dfmTab.className).toContain('active');
    expect(container.querySelector('.badge').textContent).toBe('86');

    expect((await screen.findByTestId('dfm-panel-stub')).textContent).toContain('dfm:86');

    fireEvent.click(screen.getByRole('button', { name: '↻ Rerun' }));
    expect(shell.projectState.handleRerunStage).toHaveBeenCalledWith('dfm');
  });

  it('switches rendered analysis content and applies disabled/loading rules', async () => {
    let shell = createShell({
      projectState: {
        analysisTab: 'tolerance',
        results: {
          dfm: { score: 58 },
          tolerance: { fits: [{ bore: 'B1', shaft: 'S1' }, { bore: 'B2', shaft: 'S2' }] },
          cost: { total_cost: 99999 },
        },
      },
    });
    useAppShellMock.mockImplementation(() => shell);
    const { rerender } = render(<AppAnalysisSection />);

    expect(await screen.findByTestId('tol-panel-stub')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Tolerance' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Cost' }).hasAttribute('disabled')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Cost' }));
    expect(shell.projectState.setAnalysisTab).toHaveBeenCalledWith('cost');

    shell = createShell({
      backend: { loading: true },
      projectState: {
        analysisTab: 'cost',
        rerunning: 'cost',
        results: {
          dfm: { score: 92 },
          tolerance: null,
          cost: { total_cost: 7777 },
        },
      },
    });
    rerender(<AppAnalysisSection />);

    expect((await screen.findByTestId('cost-panel-stub')).textContent).toContain('cost:7777');
    expect(screen.getByRole('button', { name: 'Tolerance' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '↻ ...' }).hasAttribute('disabled')).toBe(true);
  });
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useBackendMock,
  useProjectStateMock,
  useProfileStateMock,
  useModalStateMock,
  providerValues,
} = vi.hoisted(() => ({
  useBackendMock: vi.fn(),
  useProjectStateMock: vi.fn(),
  useProfileStateMock: vi.fn(),
  useModalStateMock: vi.fn(),
  providerValues: [],
}));

vi.mock('./hooks/useBackend.js', () => ({
  useBackend: useBackendMock,
}));

vi.mock('./hooks/useProjectState.js', () => ({
  useProjectState: useProjectStateMock,
}));

vi.mock('./hooks/useProfileState.js', () => ({
  useProfileState: useProfileStateMock,
}));

vi.mock('./hooks/useModalState.js', () => ({
  useModalState: useModalStateMock,
}));

vi.mock('./contexts/AppShellContext.jsx', () => ({
  AppShellProvider: ({ value, children }) => {
    providerValues.push(value);
    return <div data-testid="app-shell-provider">{children}</div>;
  },
}));

vi.mock('./components/AppHeader.jsx', () => ({
  default: () => <div data-testid="app-header-stub" />,
}));

vi.mock('./components/ProgressBar.jsx', () => ({
  default: ({ progress }) => <div data-testid="progress-bar-stub">{progress.status}</div>,
}));

vi.mock('./components/AppMainLayout.jsx', () => ({
  default: () => <div data-testid="app-main-layout-stub" />,
}));

vi.mock('./components/AppModals.jsx', () => ({
  default: () => <div data-testid="app-modals-stub" />,
}));

import App from './App.jsx';

function createShellState(overrides = {}) {
  const backend = {
    progress: { stage: 'drawing', status: 'start', completed: ['create'] },
    error: 'sample error',
    setError: vi.fn(),
    ...overrides.backend,
  };
  const profileState = {
    activeProfile: 'sample_precision',
    setActiveProfile: vi.fn(),
    ...overrides.profileState,
  };
  const projectState = {
    configPath: 'configs/examples/ks_flange.toml',
    results: { dfm: { score: 88 } },
    setResults: vi.fn(),
    setViewerTab: vi.fn(),
    ...overrides.projectState,
  };
  const modalState = {
    showReportModal: false,
    ...overrides.modalState,
  };

  return { backend, profileState, projectState, modalState };
}

describe('App', () => {
  beforeEach(() => {
    useBackendMock.mockReset();
    useProjectStateMock.mockReset();
    useProfileStateMock.mockReset();
    useModalStateMock.mockReset();
    providerValues.length = 0;
  });

  it('composes shell state, renders progress/error, and dismisses error', () => {
    const shell = createShellState();
    useBackendMock.mockReturnValue(shell.backend);
    useProfileStateMock.mockReturnValue(shell.profileState);
    useProjectStateMock.mockReturnValue(shell.projectState);
    useModalStateMock.mockReturnValue(shell.modalState);

    render(<App />);

    expect(screen.getByTestId('app-shell-provider')).toBeTruthy();
    expect(screen.getByTestId('app-header-stub')).toBeTruthy();
    expect(screen.getByTestId('app-main-layout-stub')).toBeTruthy();
    expect(screen.getByTestId('app-modals-stub')).toBeTruthy();
    expect(screen.getByTestId('progress-bar-stub').textContent).toBe('start');
    expect(screen.getByText('sample error')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(shell.backend.setError).toHaveBeenCalledWith(null);

    expect(useProjectStateMock).toHaveBeenCalledWith({
      backend: shell.backend,
      activeProfile: shell.profileState.activeProfile,
      setActiveProfile: shell.profileState.setActiveProfile,
    });
    expect(useModalStateMock).toHaveBeenCalledWith({
      backend: shell.backend,
      configPath: shell.projectState.configPath,
      results: shell.projectState.results,
      setResults: shell.projectState.setResults,
      activeProfile: shell.profileState.activeProfile,
      setViewerTab: shell.projectState.setViewerTab,
    });

    expect(providerValues[0]).toEqual({
      backend: shell.backend,
      profileState: shell.profileState,
      projectState: shell.projectState,
      modalState: shell.modalState,
    });
  });

  it('hides progress when status is done and hides error bar when no error exists', () => {
    const shell = createShellState({
      backend: {
        progress: { stage: 'cost', status: 'done', completed: ['create', 'drawing', 'dfm', 'cost'] },
        error: null,
      },
    });
    useBackendMock.mockReturnValue(shell.backend);
    useProfileStateMock.mockReturnValue(shell.profileState);
    useProjectStateMock.mockReturnValue(shell.projectState);
    useModalStateMock.mockReturnValue(shell.modalState);

    render(<App />);

    expect(screen.queryByTestId('progress-bar-stub')).toBeNull();
    expect(screen.queryByText('Dismiss')).toBeNull();
  });
});

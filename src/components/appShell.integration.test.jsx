import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppShellProvider } from '../contexts/AppShellContext.jsx';
import AppHeader from './AppHeader.jsx';
import AppMainLayout from './AppMainLayout.jsx';
import AppModals from './AppModals.jsx';

vi.mock('./layout/AppSidebar.jsx', () => ({
  default: () => <div data-testid="sidebar" />, 
}));

vi.mock('./layout/AppViewerSection.jsx', () => ({
  default: () => <div data-testid="viewer-section" />,
}));

vi.mock('./layout/AppAnalysisSection.jsx', () => ({
  default: () => <div data-testid="analysis-section" />,
}));

vi.mock('./layout/AppEmptyState.jsx', () => ({
  default: () => <div data-testid="empty-state" />,
}));

vi.mock('./StepImportModal.jsx', () => ({
  default: () => <div data-testid="step-modal" />,
}));

vi.mock('./ShopProfileModal.jsx', () => ({
  default: () => <div data-testid="profile-modal" />,
}));

vi.mock('./ReportConfigModal.jsx', () => ({
  default: () => <div data-testid="report-modal" />,
}));

vi.mock('./TemplateEditorModal.jsx', () => ({
  default: () => <div data-testid="template-modal" />,
}));

vi.mock('./ProfileCompareModal.jsx', () => ({
  default: () => <div data-testid="compare-modal" />,
}));

vi.mock('./ExportPackModal.jsx', () => ({
  default: () => <div data-testid="export-modal" />,
}));

function createShell(overrides = {}) {
  const backend = {
    loading: false,
    progress: null,
    error: null,
    cancelAnalyze: vi.fn(),
    setError: vi.fn(),
    getCacheStats: vi.fn(),
    clearCache: vi.fn(),
    getDiagnostics: vi.fn(),
    ...(overrides.backend || {}),
  };

  const profileState = {
    profiles: [{ name: '_default' }],
    activeProfile: '_default',
    activeProfileData: null,
    editingProfile: null,
    showProfileModal: false,
    showCompareModal: false,
    handleProfileChange: vi.fn(),
    handleEditProfile: vi.fn(),
    handleNewProfile: vi.fn(),
    handleSaveProfile: vi.fn(),
    handleDeleteProfile: vi.fn(),
    openCompareModal: vi.fn(),
    closeCompareModal: vi.fn(),
    closeProfileModal: vi.fn(),
    setActiveProfile: vi.fn(),
    ...(overrides.profileState || {}),
  };

  const projectState = {
    configPath: 'configs/examples/ks_flange.toml',
    examples: ['ks_flange.toml'],
    results: null,
    setResults: vi.fn(),
    stepImportData: null,
    viewerTab: '3d',
    setViewerTab: vi.fn(),
    analysisTab: 'dfm',
    setAnalysisTab: vi.fn(),
    settings: { process: 'machining', material: 'SS304', batch: 100, standard: 'KS' },
    setSettings: vi.fn(),
    rerunning: null,
    handleFileSelect: vi.fn(),
    handleAnalyze: vi.fn(),
    handleRerunStage: vi.fn(),
    handleUseStepConfig: vi.fn(),
    handleSaveStepConfig: vi.fn(),
    handleSaveProject: vi.fn(),
    handleOpenProject: vi.fn(),
    setStepImportData: vi.fn(),
    ...(overrides.projectState || {}),
  };

  const modalState = {
    showReportModal: false,
    showTemplateEditor: false,
    showExportModal: false,
    lastTemplateName: null,
    editingTemplate: null,
    openReportModal: vi.fn(),
    closeReportModal: vi.fn(),
    handleGenerateReport: vi.fn(),
    handleEditTemplate: vi.fn(),
    handleNewTemplate: vi.fn(),
    handleSaveTemplate: vi.fn(),
    handleDeleteTemplate: vi.fn(),
    closeTemplateEditor: vi.fn(),
    openExportModal: vi.fn(),
    closeExportModal: vi.fn(),
    handleExportPack: vi.fn(),
    ...(overrides.modalState || {}),
  };

  return { backend, profileState, projectState, modalState };
}

describe('App shell context integration', () => {
  it('wires AppHeader button actions from context handlers', () => {
    const shell = createShell({
      projectState: { results: { dfm: { score: 88 } } },
    });

    render(
      <AppShellProvider value={shell}>
        <AppHeader />
      </AppShellProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));

    expect(shell.projectState.handleAnalyze).toHaveBeenCalledTimes(1);
    expect(shell.projectState.handleOpenProject).toHaveBeenCalledTimes(1);
    expect(shell.modalState.openReportModal).toHaveBeenCalledTimes(1);
  });

  it('switches AppMainLayout sections based on context state', () => {
    const emptyShell = createShell({
      backend: { loading: false },
      projectState: { results: null },
    });

    const { rerender } = render(
      <AppShellProvider value={emptyShell}>
        <AppMainLayout />
      </AppShellProvider>
    );

    expect(screen.getByTestId('viewer-section')).not.toBeNull();
    expect(screen.getByTestId('empty-state')).not.toBeNull();
    expect(screen.queryByTestId('analysis-section')).toBeNull();

    const resultShell = createShell({
      backend: { loading: false },
      projectState: { results: { dfm: { score: 88 } } },
    });

    rerender(
      <AppShellProvider value={resultShell}>
        <AppMainLayout />
      </AppShellProvider>
    );

    expect(screen.getByTestId('analysis-section')).not.toBeNull();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });

  it('renders modal groups through context-driven state', () => {
    const shell = createShell({
      profileState: {
        showProfileModal: true,
        showCompareModal: true,
        editingProfile: { _isNew: true, name: 'new_profile' },
      },
      projectState: {
        stepImportData: { configPath: 'configs/imports/mock.toml' },
      },
      modalState: {
        showReportModal: true,
        showTemplateEditor: true,
        showExportModal: true,
      },
    });

    render(
      <AppShellProvider value={shell}>
        <AppModals />
      </AppShellProvider>
    );

    expect(screen.getByTestId('step-modal')).not.toBeNull();
    expect(screen.getByTestId('profile-modal')).not.toBeNull();
    expect(screen.getByTestId('report-modal')).not.toBeNull();
    expect(screen.getByTestId('template-modal')).not.toBeNull();
    expect(screen.getByTestId('compare-modal')).not.toBeNull();
    expect(screen.getByTestId('export-modal')).not.toBeNull();
  });
});

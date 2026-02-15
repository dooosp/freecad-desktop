import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useAppShellMock } = vi.hoisted(() => ({
  useAppShellMock: vi.fn(),
}));

vi.mock('../../contexts/AppShellContext.jsx', () => ({
  useAppShell: useAppShellMock,
}));

vi.mock('../StepImportModal.jsx', () => ({
  default: (props) => (
    <button data-testid="step-import-modal-stub" onClick={() => props.onCancel()}>
      {props.data?.configPath || 'step'}
    </button>
  ),
}));

vi.mock('../ShopProfileModal.jsx', () => ({
  default: (props) => (
    <button data-testid="shop-profile-modal-stub" onClick={() => props.onSave(props.profile)}>
      {props.profile?.name || 'profile'}
    </button>
  ),
}));

vi.mock('../ReportConfigModal.jsx', () => ({
  default: (props) => (
    <button data-testid="report-config-modal-stub" onClick={() => props.onEditTemplate?.('tpl_a')}>
      report
    </button>
  ),
}));

vi.mock('../TemplateEditorModal.jsx', () => ({
  default: (props) => (
    <button data-testid="template-editor-modal-stub" onClick={() => props.onDelete?.(props.template?.name)}>
      template
    </button>
  ),
}));

import ProjectFlowModals from './ProjectFlowModals.jsx';

function createShell(overrides = {}) {
  return {
    backend: { getReportTemplates: vi.fn(), ...(overrides.backend || {}) },
    profileState: {
      showProfileModal: false,
      editingProfile: null,
      handleSaveProfile: vi.fn(),
      handleDeleteProfile: vi.fn(),
      closeProfileModal: vi.fn(),
      ...(overrides.profileState || {}),
    },
    projectState: {
      stepImportData: null,
      handleUseStepConfig: vi.fn(),
      handleSaveStepConfig: vi.fn(),
      setStepImportData: vi.fn(),
      ...(overrides.projectState || {}),
    },
    modalState: {
      showReportModal: false,
      handleGenerateReport: vi.fn(),
      closeReportModal: vi.fn(),
      handleEditTemplate: vi.fn(),
      handleNewTemplate: vi.fn(),
      showTemplateEditor: false,
      editingTemplate: null,
      handleSaveTemplate: vi.fn(),
      handleDeleteTemplate: vi.fn(),
      closeTemplateEditor: vi.fn(),
      ...(overrides.modalState || {}),
    },
  };
}

describe('ProjectFlowModals', () => {
  beforeEach(() => {
    useAppShellMock.mockReset();
  });

  it('renders all project flow modals and wires callbacks', () => {
    const shell = createShell({
      projectState: {
        stepImportData: { configPath: 'configs/imports/a.toml' },
      },
      profileState: {
        showProfileModal: true,
        editingProfile: { name: 'sample_precision' },
      },
      modalState: {
        showReportModal: true,
        showTemplateEditor: true,
        editingTemplate: { name: 'customer_tpl' },
      },
    });
    useAppShellMock.mockReturnValue(shell);

    render(<ProjectFlowModals />);

    fireEvent.click(screen.getByTestId('step-import-modal-stub'));
    expect(shell.projectState.setStepImportData).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByTestId('shop-profile-modal-stub'));
    expect(shell.profileState.handleSaveProfile).toHaveBeenCalledWith({ name: 'sample_precision' });

    fireEvent.click(screen.getByTestId('report-config-modal-stub'));
    expect(shell.modalState.handleEditTemplate).toHaveBeenCalledWith('tpl_a');

    fireEvent.click(screen.getByTestId('template-editor-modal-stub'));
    expect(shell.modalState.handleDeleteTemplate).toHaveBeenCalledWith('customer_tpl');
  });

  it('renders nothing when all modal flags are false', () => {
    useAppShellMock.mockReturnValue(createShell());
    const { container } = render(<ProjectFlowModals />);
    expect(container.firstChild).toBeNull();
  });
});

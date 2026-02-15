import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useAppShellMock } = vi.hoisted(() => ({
  useAppShellMock: vi.fn(),
}));

vi.mock('../../contexts/AppShellContext.jsx', () => ({
  useAppShell: useAppShellMock,
}));

vi.mock('../ProfileCompareModal.jsx', () => ({
  default: (props) => (
    <button data-testid="profile-compare-modal-stub" onClick={() => props.onCancel()}>
      {props.configPath}
    </button>
  ),
}));

vi.mock('../ExportPackModal.jsx', () => ({
  default: (props) => (
    <button data-testid="export-pack-modal-stub" onClick={() => props.onExport({ configPath: props.configPath })}>
      {props.templateName || 'legacy'}
    </button>
  ),
}));

import AnalysisFlowModals from './AnalysisFlowModals.jsx';

function createShell(overrides = {}) {
  return {
    backend: { compareProfiles: vi.fn(), ...(overrides.backend || {}) },
    profileState: {
      profiles: [{ name: '_default' }, { name: 'sample_precision' }],
      activeProfile: 'sample_precision',
      showCompareModal: false,
      closeCompareModal: vi.fn(),
      ...(overrides.profileState || {}),
    },
    projectState: {
      configPath: 'configs/examples/ks_flange.toml',
      settings: { process: 'machining', material: 'SS304', batch: 100 },
      ...(overrides.projectState || {}),
    },
    modalState: {
      showExportModal: false,
      lastTemplateName: null,
      handleExportPack: vi.fn(),
      closeExportModal: vi.fn(),
      ...(overrides.modalState || {}),
    },
  };
}

describe('AnalysisFlowModals', () => {
  beforeEach(() => {
    useAppShellMock.mockReset();
  });

  it('renders compare/export modals and forwards handlers', () => {
    const shell = createShell({
      profileState: { showCompareModal: true },
      modalState: { showExportModal: true, lastTemplateName: 'customer_tpl' },
    });
    useAppShellMock.mockReturnValue(shell);

    render(<AnalysisFlowModals />);

    fireEvent.click(screen.getByTestId('profile-compare-modal-stub'));
    expect(shell.profileState.closeCompareModal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('export-pack-modal-stub'));
    expect(shell.modalState.handleExportPack).toHaveBeenCalledWith({
      configPath: 'configs/examples/ks_flange.toml',
    });
  });

  it('renders nothing when both flags are false', () => {
    useAppShellMock.mockReturnValue(createShell());
    const { container } = render(<AnalysisFlowModals />);
    expect(container.firstChild).toBeNull();
  });
});

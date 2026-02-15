import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  useAppShellMock,
  fileDropProps,
  settingsProps,
  shopProfileProps,
} = vi.hoisted(() => ({
  useAppShellMock: vi.fn(),
  fileDropProps: [],
  settingsProps: [],
  shopProfileProps: [],
}));

vi.mock('../../contexts/AppShellContext.jsx', () => ({
  useAppShell: useAppShellMock,
}));

vi.mock('../FileDropZone.jsx', () => ({
  default: (props) => {
    fileDropProps.push(props);
    return (
      <button data-testid="file-drop-zone" onClick={() => props.onFileSelect('/tmp/from-drop.toml')}>
        FileDropZone
      </button>
    );
  },
}));

vi.mock('../SettingsPanel.jsx', () => ({
  default: (props) => {
    settingsProps.push(props);
    return <div data-testid="settings-panel-stub" />;
  },
}));

vi.mock('../ShopProfilePanel.jsx', () => ({
  default: (props) => {
    shopProfileProps.push(props);
    return <div data-testid="shop-profile-panel-stub" />;
  },
}));

import AppSidebar from './AppSidebar.jsx';

function createShell(overrides = {}) {
  return {
    backend: {
      getCacheStats: vi.fn(),
      clearCache: vi.fn(),
      getDiagnostics: vi.fn(),
      ...(overrides.backend || {}),
    },
    profileState: {
      profiles: [{ name: '_default' }, { name: 'sample_precision' }],
      activeProfile: '_default',
      activeProfileData: { process_capabilities: {} },
      handleProfileChange: vi.fn(),
      handleEditProfile: vi.fn(),
      handleNewProfile: vi.fn(),
      openCompareModal: vi.fn(),
      ...(overrides.profileState || {}),
    },
    projectState: {
      handleFileSelect: vi.fn(),
      examples: ['ks_flange.toml', 'bearing_block.toml'],
      configPath: 'configs/examples/ks_flange.toml',
      settings: { process: 'machining', material: 'SS304', standard: 'KS', batch: 100 },
      setSettings: vi.fn(),
      ...(overrides.projectState || {}),
    },
  };
}

describe('AppSidebar', () => {
  beforeEach(() => {
    fileDropProps.length = 0;
    settingsProps.length = 0;
    shopProfileProps.length = 0;
    useAppShellMock.mockReset();
  });

  it('wires context handlers, passes props to children, and renders example buttons', () => {
    const shell = createShell();
    useAppShellMock.mockReturnValue(shell);
    const { container } = render(<AppSidebar />);

    expect(screen.getByTestId('shop-profile-panel-stub')).toBeTruthy();
    expect(screen.getByTestId('settings-panel-stub')).toBeTruthy();
    expect(screen.getByTestId('file-drop-zone')).toBeTruthy();

    fireEvent.click(screen.getByTestId('file-drop-zone'));
    expect(shell.projectState.handleFileSelect).toHaveBeenCalledWith('/tmp/from-drop.toml');

    const ksBtn = screen.getByRole('button', { name: 'ks_flange' });
    const bearingBtn = screen.getByRole('button', { name: 'bearing_block' });
    expect(ksBtn.className).toContain('active');
    expect(bearingBtn.className).not.toContain('active');

    fireEvent.click(bearingBtn);
    expect(shell.projectState.handleFileSelect).toHaveBeenCalledWith('configs/examples/bearing_block.toml');

    expect(shopProfileProps[0].profiles).toEqual(shell.profileState.profiles);
    expect(shopProfileProps[0].onProfileChange).toBe(shell.profileState.handleProfileChange);

    expect(fileDropProps[0].onFileSelect).toBe(shell.projectState.handleFileSelect);

    expect(settingsProps[0]).toMatchObject({
      settings: shell.projectState.settings,
      onChange: shell.projectState.setSettings,
      activeProfile: shell.profileState.activeProfileData,
      getCacheStats: shell.backend.getCacheStats,
      clearCache: shell.backend.clearCache,
      getDiagnostics: shell.backend.getDiagnostics,
    });

    expect(container.querySelectorAll('.example-item').length).toBe(2);
  });

  it('hides examples section when list is empty', () => {
    const shell = createShell({
      projectState: {
        examples: [],
      },
    });
    useAppShellMock.mockReturnValue(shell);

    render(<AppSidebar />);

    expect(screen.queryByText('Examples')).toBeNull();
    expect(screen.queryByRole('button', { name: 'ks_flange' })).toBeNull();
  });
});

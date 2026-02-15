import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ShopProfilePanel from './ShopProfilePanel.jsx';

describe('ShopProfilePanel', () => {
  it('renders loading state when profiles are absent', () => {
    render(
      <ShopProfilePanel
        profiles={[]}
        activeProfile="_default"
        activeProfileData={null}
        onProfileChange={vi.fn()}
        onEditProfile={vi.fn()}
        onNewProfile={vi.fn()}
        onCompareProfiles={vi.fn()}
      />,
    );

    const select = screen.getByRole('combobox');
    expect(select.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Loading...')).toBeTruthy();
    expect(screen.queryByTitle('Compare Profiles')).toBeNull();
  });

  it('renders profile controls, calls handlers, and shows summary', () => {
    const onProfileChange = vi.fn();
    const onEditProfile = vi.fn();
    const onNewProfile = vi.fn();
    const onCompareProfiles = vi.fn();

    render(
      <ShopProfilePanel
        profiles={[{ name: '_default' }, { name: 'sample_precision' }]}
        activeProfile="sample_precision"
        activeProfileData={{
          process_capabilities: {
            machining: { available: true },
            casting: { available: false },
            sheet_metal: { available: true },
          },
          material_rates: {
            SS304: { available: true },
            AL6061: { available: true },
            titanium: { available: false },
          },
        }}
        onProfileChange={onProfileChange}
        onEditProfile={onEditProfile}
        onNewProfile={onNewProfile}
        onCompareProfiles={onCompareProfiles}
      />,
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '_default' } });
    expect(onProfileChange).toHaveBeenCalledWith('_default');

    fireEvent.click(screen.getByTitle('Edit Profile'));
    fireEvent.click(screen.getByTitle('New Profile'));
    fireEvent.click(screen.getByTitle('Compare Profiles'));
    expect(onEditProfile).toHaveBeenCalledTimes(1);
    expect(onNewProfile).toHaveBeenCalledTimes(1);
    expect(onCompareProfiles).toHaveBeenCalledTimes(1);

    expect(screen.getByText('2 processes, 2 materials')).toBeTruthy();
  });

  it('hides summary for default profile and compare button when only one profile exists', () => {
    render(
      <ShopProfilePanel
        profiles={[{ name: '_default' }]}
        activeProfile="_default"
        activeProfileData={{
          process_capabilities: { machining: { available: true } },
          material_rates: { SS304: { available: true } },
        }}
        onProfileChange={vi.fn()}
        onEditProfile={vi.fn()}
        onNewProfile={vi.fn()}
        onCompareProfiles={vi.fn()}
      />,
    );

    expect(screen.queryByText(/process/)).toBeNull();
    expect(screen.queryByTitle('Compare Profiles')).toBeNull();
    expect(screen.getByRole('option', { name: 'Default' })).toBeTruthy();
  });
});

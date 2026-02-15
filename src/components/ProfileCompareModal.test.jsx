import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProfileCompareModal from './ProfileCompareModal.jsx';

describe('ProfileCompareModal', () => {
  const profiles = [
    { name: '_default' },
    { name: 'sample_precision' },
    { name: 'budget_shop' },
  ];

  const settings = { process: 'machining', material: 'SS304', batch: 100 };

  it('enforces different profile selection and renders comparison table/bars', async () => {
    const backend = {
      compareProfiles: vi.fn(async () => ({
        profileA: {
          name: '_default',
          dfm: { score: 80, summary: { errors: 2, warnings: 3 } },
          cost: { unit_cost: 12000, total_cost: 1200000, material_cost: 500000, machining_cost: 600000, setup_cost: 70000, inspection_cost: 30000 },
        },
        profileB: {
          name: 'budget_shop',
          dfm: { score: 90, summary: { errors: 1, warnings: 2 } },
          cost: { unit_cost: 9000, total_cost: 900000, material_cost: 420000, machining_cost: 390000, setup_cost: 60000, inspection_cost: 30000 },
        },
      })),
    };

    render(
      <ProfileCompareModal
        profiles={profiles}
        configPath="configs/examples/ks_flange.toml"
        settings={settings}
        backend={backend}
        onCancel={vi.fn()}
      />,
    );

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: '_default' } });
    expect(screen.getByText('Select two different profiles to compare.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Compare' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(selects[1], { target: { value: 'budget_shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));

    await waitFor(() => {
      expect(backend.compareProfiles).toHaveBeenCalledWith({
        configPath: 'configs/examples/ks_flange.toml',
        profileA: '_default',
        profileB: 'budget_shop',
        options: {
          process: 'machining',
          material: 'SS304',
          batch: 100,
        },
      });
      expect(screen.getByText('Metric')).toBeTruthy();
    });

    expect(screen.getByText('DFM Score')).toBeTruthy();
    expect(screen.getByText('+12.5%')).toBeTruthy();
    expect(screen.getAllByText('-25.0%').length).toBeGreaterThanOrEqual(1);
    const bars = document.querySelectorAll('.compare-bar-fill');
    expect(bars.length).toBe(2);
    expect(Number.parseFloat(bars[0].style.width)).toBeGreaterThan(Number.parseFloat(bars[1].style.width));
  });

  it('handles backend compare errors without crashing and closes modal', async () => {
    const backend = {
      compareProfiles: vi.fn(async () => {
        throw new Error('compare failed');
      }),
    };
    const onCancel = vi.fn();
    const { container } = render(
      <ProfileCompareModal
        profiles={profiles}
        configPath="configs/examples/ks_flange.toml"
        settings={settings}
        backend={backend}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Compare' }).hasAttribute('disabled')).toBe(false);
    });
    expect(screen.queryByText('Metric')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(container.querySelector('.modal-overlay'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

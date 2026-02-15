import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsPanel from './SettingsPanel.jsx';

const baseSettings = {
  process: 'machining',
  material: 'SS304',
  standard: 'KS',
  batch: 100,
  dxfExport: false,
};

describe('SettingsPanel', () => {
  it('updates settings, filters options by profile, and handles cache/diagnostics actions', async () => {
    const onChange = vi.fn();
    const clearCache = vi.fn(async () => {});
    const getCacheStats = vi
      .fn()
      .mockResolvedValueOnce({ entries: 2, totalSizeBytes: 2048 })
      .mockResolvedValueOnce({ entries: 0, totalSizeBytes: 0 });
    const getDiagnostics = vi.fn(async () => ({
      checks: [
        { id: 'python', label: 'Python Executable', status: 'pass', detail: 'Python 3.11' },
        { id: 'freecad', label: 'FreeCAD Module', status: 'warn', detail: 'missing' },
      ],
    }));

    const { container } = render(
      <SettingsPanel
        settings={baseSettings}
        onChange={onChange}
        activeProfile={{
          process_capabilities: {
            casting: { available: false },
          },
          material_rates: {
            titanium: { available: false },
          },
        }}
        getCacheStats={getCacheStats}
        clearCache={clearCache}
        getDiagnostics={getDiagnostics}
      />,
    );

    await waitFor(() => {
      expect(getCacheStats).toHaveBeenCalledTimes(1);
      expect(screen.getByText('2 entries (2.0 KB)')).toBeTruthy();
    });

    const selects = container.querySelectorAll('select');
    const processSelect = selects[0];
    const materialSelect = selects[1];
    const standardSelect = selects[2];

    expect(processSelect.querySelector('option[value="casting"]')).toBeNull();
    expect(materialSelect.querySelector('option[value="titanium"]')).toBeNull();

    fireEvent.change(processSelect, { target: { value: 'sheet_metal' } });
    fireEvent.change(materialSelect, { target: { value: 'AL6061' } });
    fireEvent.change(standardSelect, { target: { value: 'ISO' } });

    const batchInput = container.querySelector('input[type="number"]');
    fireEvent.change(batchInput, { target: { value: '' } });

    const dxfCheckbox = container.querySelector('input[type="checkbox"]');
    fireEvent.click(dxfCheckbox);

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.some(([payload]) => payload.process === 'sheet_metal')).toBe(true);
    expect(onChange.mock.calls.some(([payload]) => payload.material === 'AL6061')).toBe(true);
    expect(onChange.mock.calls.some(([payload]) => payload.standard === 'ISO')).toBe(true);
    expect(onChange.mock.calls.some(([payload]) => payload.batch === 1)).toBe(true);
    expect(onChange.mock.calls.some(([payload]) => payload.dxfExport === true)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => {
      expect(clearCache).toHaveBeenCalledTimes(1);
      expect(getCacheStats).toHaveBeenCalledTimes(2);
      expect(screen.getByText('0 entries (0 B)')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Run Check' }));
    await waitFor(() => {
      expect(getDiagnostics).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Python Executable')).toBeTruthy();
      expect(screen.getByText('FreeCAD Module')).toBeTruthy();
      expect(screen.getByText('Python 3.11')).toBeTruthy();
    });
  });

  it('disables clear button for empty cache and handles optional callbacks being absent', async () => {
    const onChange = vi.fn();
    const getCacheStats = vi.fn(async () => ({ entries: 0, totalSizeBytes: 0 }));
    const { container } = render(
      <SettingsPanel
        settings={baseSettings}
        onChange={onChange}
        activeProfile={null}
        getCacheStats={getCacheStats}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('0 entries (0 B)')).toBeTruthy();
    });

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    expect(clearBtn.hasAttribute('disabled')).toBe(true);

    const runCheck = screen.getByRole('button', { name: 'Run Check' });
    fireEvent.click(runCheck);
    expect(container.querySelectorAll('.diag-item').length).toBe(0);
  });
});

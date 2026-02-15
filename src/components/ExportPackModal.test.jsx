import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ExportPackModal from './ExportPackModal.jsx';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ExportPackModal', () => {
  it('renders defaults and updates package preview when include options change', () => {
    render(
      <ExportPackModal
        configPath="configs/examples/ks_flange.toml"
        activeProfile="sample_precision"
        templateName="standard_ko"
        onExport={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Export Package')).toBeTruthy();
    expect(screen.getByText('Profile: sample_precision | Template: standard_ko')).toBeTruthy();

    const previewBefore = document.querySelector('.folder-preview').textContent;
    expect(previewBefore).toContain('part_A/');
    expect(previewBefore).not.toContain('part_front.dxf');

    fireEvent.click(screen.getByLabelText('DXF Drawing'));
    const previewAfter = document.querySelector('.folder-preview').textContent;
    expect(previewAfter).toContain('part_front.dxf');
  });

  it('calls onExport with form values and include map, then clears loading', async () => {
    const onCancel = vi.fn();
    const deferred = createDeferred();
    const onExport = vi.fn(() => deferred.promise);
    render(
      <ExportPackModal
        configPath="configs/examples/ks_flange.toml"
        activeProfile="_default"
        templateName={null}
        onExport={onExport}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Part Name *'), { target: { value: 'gear_case' } });
    fireEvent.change(screen.getByPlaceholderText('Revision'), { target: { value: 'B' } });
    fireEvent.change(screen.getByPlaceholderText('Company or Organization Name'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByLabelText('DFM JSON'));

    fireEvent.click(screen.getByRole('button', { name: 'Generate Package' }));
    expect(screen.getByRole('button', { name: 'Generating...' }).hasAttribute('disabled')).toBe(true);
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({
      configPath: 'configs/examples/ks_flange.toml',
      partName: 'gear_case',
      revision: 'B',
      organization: 'Acme',
      include: expect.objectContaining({
        step: true,
        dxf: false,
        dfm: false,
      }),
    }));

    deferred.resolve();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate Package' }).hasAttribute('disabled')).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows export summary with filename, output count, and selected output labels', async () => {
    const onExport = vi.fn().mockResolvedValue({
      filename: 'gear_case_bundle.zip',
      zipBase64: 'UEs=',
    });

    render(
      <ExportPackModal
        configPath="configs/examples/ks_flange.toml"
        activeProfile="sample_precision"
        templateName="standard_ko"
        onExport={onExport}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('DXF Drawing'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate Package' }));

    await waitFor(() => {
      expect(screen.getByText('Latest Export Result')).toBeTruthy();
      expect(screen.getByText('gear_case_bundle.zip')).toBeTruthy();
      expect(screen.getByText('Included Outputs')).toBeTruthy();
      expect(screen.getByText('Selected Outputs')).toBeTruthy();
    });
  });

  it('shows inline guidance when export fails', async () => {
    const onExport = vi.fn().mockRejectedValue(new Error('Export service is temporarily unavailable. Wait a moment and retry.'));
    render(
      <ExportPackModal
        configPath="configs/examples/ks_flange.toml"
        activeProfile="_default"
        templateName={null}
        onExport={onExport}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate Package' }));

    await waitFor(() => {
      expect(screen.getByText('Export service is temporarily unavailable. Wait a moment and retry.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Generate Package' }).hasAttribute('disabled')).toBe(false);
    });
  });

  it('blocks export when no output option is selected', async () => {
    const onExport = vi.fn();
    render(
      <ExportPackModal
        configPath="configs/examples/ks_flange.toml"
        activeProfile="_default"
        templateName={null}
        onExport={onExport}
        onCancel={vi.fn()}
      />,
    );

    const enabledByDefault = [
      'STEP File',
      'SVG Drawing',
      'Drawing PDF',
      'DFM JSON',
      'Tolerance JSON',
      'Cost JSON',
      'Engineering Report PDF',
      'Bill of Materials CSV',
    ];
    for (const label of enabledByDefault) {
      fireEvent.click(screen.getByLabelText(label));
    }

    fireEvent.click(screen.getByRole('button', { name: 'Generate Package' }));

    expect(onExport).not.toHaveBeenCalled();
    expect(screen.getByText('Select at least one output file before generating the package.')).toBeTruthy();
  });

  it('closes on overlay/background click and close icon', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ExportPackModal
        configPath="configs/examples/ks_flange.toml"
        activeProfile="_default"
        templateName={null}
        onExport={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(container.querySelector('.modal-overlay'));
    fireEvent.click(container.querySelector('.modal-header .btn-icon'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StepImportModal from './StepImportModal.jsx';

describe('StepImportModal', () => {
  it('renders detected features from analysis data', () => {
    render(
      <StepImportModal
        data={{
          configPath: 'configs/imports/part.toml',
          tomlString: 'name = "part"',
          analysis: {
            warning: 'fallback used',
            part_type: 'flange',
            bounding_box: { x: 100, y: 80, z: 20 },
            features: {
              cylinders: [{}, {}, {}],
              bolt_circles: [{}],
            },
            suggested_config: {
              name: 'imported_part',
              manufacturing: { process: 'machining' },
            },
          },
        }}
        onUseConfig={vi.fn()}
        onSaveConfig={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('STEP Import')).toBeTruthy();
    expect(screen.getByText('fallback used')).toBeTruthy();
    expect(screen.getByText('imported_part')).toBeTruthy();
    expect(screen.getByText('flange')).toBeTruthy();
    expect(screen.getByText('100.0 x 80.0 x 20.0 mm')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('machining')).toBeTruthy();
  });

  it('saves edited TOML before applying config', async () => {
    const onUseConfig = vi.fn();
    const onSaveConfig = vi.fn(async () => {});

    render(
      <StepImportModal
        data={{
          configPath: 'configs/imports/edited.toml',
          tomlString: 'name = "old"',
          analysis: { cylinders: 2, bolt_circles: 0 },
        }}
        onUseConfig={onUseConfig}
        onSaveConfig={onSaveConfig}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'name = "new"' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Config' }));

    await waitFor(() => {
      expect(onSaveConfig).toHaveBeenCalledWith('configs/imports/edited.toml', 'name = "new"');
      expect(onUseConfig).toHaveBeenCalledWith('configs/imports/edited.toml');
    });
    expect(onSaveConfig.mock.invocationCallOrder[0]).toBeLessThan(onUseConfig.mock.invocationCallOrder[0]);
  });

  it('uses config directly when TOML is not edited and supports cancel actions', async () => {
    const onUseConfig = vi.fn();
    const onSaveConfig = vi.fn(async () => {});
    const onCancel = vi.fn();
    const { container } = render(
      <StepImportModal
        data={{
          configPath: 'configs/imports/direct.toml',
          tomlString: 'name = "direct"',
          analysis: { cylinders: 1, bolt_circles: 2 },
        }}
        onUseConfig={onUseConfig}
        onSaveConfig={onSaveConfig}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use Config' }));
    await waitFor(() => {
      expect(onUseConfig).toHaveBeenCalledWith('configs/imports/direct.toml');
    });
    expect(onSaveConfig).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(container.querySelector('.modal-header .btn-icon'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

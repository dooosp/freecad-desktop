import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FemPanel from './FemPanel.jsx';

function createMockBackend() {
  return {
    runFem: vi.fn(async () => ({
      max_displacement: 0.023,
      max_stress: 145.2,
      safety_factor: 1.72,
      mesh_info: { nodes: 12500, elements: 8300 },
    })),
  };
}

describe('FemPanel', () => {
  it('shows no-config message when configPath is missing', () => {
    const backend = createMockBackend();
    render(<FemPanel backend={backend} configPath={null} />);

    expect(screen.getByText(/Load or create a model first/i)).toBeTruthy();
  });

  it('renders material selector and analysis type when configPath is provided', () => {
    const backend = createMockBackend();
    render(<FemPanel backend={backend} configPath="configs/test.toml" />);

    expect(screen.getByText('Steel (7850 kg/m\u00B3)')).toBeTruthy();
    expect(screen.getByText('Static')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run FEM' })).toBeTruthy();
  });

  it('shows Number of Modes input when frequency analysis is selected', () => {
    const backend = createMockBackend();
    render(<FemPanel backend={backend} configPath="configs/test.toml" />);

    const selects = screen.getAllByRole('combobox');
    const analysisSelect = selects[0];
    fireEvent.change(analysisSelect, { target: { value: 'frequency' } });

    expect(screen.getByText('Number of Modes')).toBeTruthy();
  });

  it('runs FEM and shows results', async () => {
    const backend = createMockBackend();
    render(<FemPanel backend={backend} configPath="configs/test.toml" />);

    fireEvent.click(screen.getByRole('button', { name: 'Run FEM' }));

    expect(await screen.findByText('Results')).toBeTruthy();
    expect(screen.getByText('0.0230 mm')).toBeTruthy();
    expect(screen.getByText('145.2 MPa')).toBeTruthy();
    expect(screen.getByText('1.72')).toBeTruthy();
    expect(screen.getByText(/12500 nodes/)).toBeTruthy();
  });

  it('does not render frequencies card when frequencies is empty array', async () => {
    const backend = {
      runFem: vi.fn(async () => ({
        max_displacement: 0.01,
        max_stress: 50,
        safety_factor: 3.0,
        frequencies: [],
        mesh_info: { nodes: 100, elements: 50 },
      })),
    };
    render(<FemPanel backend={backend} configPath="configs/test.toml" />);

    fireEvent.click(screen.getByRole('button', { name: 'Run FEM' }));
    await screen.findByText('Results');

    expect(screen.queryByText(/Natural Frequencies/)).toBeNull();
  });
});

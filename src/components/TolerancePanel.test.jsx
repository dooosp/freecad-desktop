import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { chartInstances, registerSpy } = vi.hoisted(() => ({
  chartInstances: [],
  registerSpy: vi.fn(),
}));

vi.mock('chart.js', () => {
  class MockChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.destroy = vi.fn();
      chartInstances.push(this);
    }
  }
  MockChart.register = registerSpy;
  return { Chart: MockChart, registerables: ['mock-reg'] };
});

import TolerancePanel from './TolerancePanel.jsx';

describe('TolerancePanel', () => {
  it('renders null without data', () => {
    const { container } = render(<TolerancePanel data={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders fit table, stackup, and monte-carlo histogram (tuple bins)', () => {
    chartInstances.length = 0;
    const { container, unmount } = render(
      <TolerancePanel
        data={{
          fit_pairs: [
            {
              hole: 'Bore-A',
              shaft: 'Shaft-A',
              designation: 'H7/g6',
              type: 'clearance',
              min_clearance: 0.0123,
              max_clearance: 0.0456,
            },
          ],
          tolerance_stackup: {
            total: 0.2,
            contributors: [
              { name: 'A', tolerance: 0.05 },
              { name: 'B', tolerance: -0.15 },
            ],
          },
          monte_carlo: {
            mean: 0.0102,
            std_dev: 0.0015,
            cpk: 1.45,
            yield_pct: 99.1,
            histogram: { bins: [[0.009, 2], [0.01, 5], [0.011, 3]] },
          },
        }}
      />,
    );

    expect(screen.getByText('Fit Pairs')).toBeTruthy();
    expect(screen.getByText('Bore-A')).toBeTruthy();
    expect(screen.getByText('Shaft-A')).toBeTruthy();
    expect(screen.getByText('clearance')).toBeTruthy();
    expect(screen.getByText('0.012')).toBeTruthy();
    expect(screen.getByText('0.046')).toBeTruthy();

    expect(screen.getByText('Tolerance Stack-up')).toBeTruthy();
    expect(screen.getByText('Total: ±0.200 mm')).toBeTruthy();
    const segments = container.querySelectorAll('.stackup-segment');
    expect(segments.length).toBe(2);
    expect(segments[0].style.width).toBe('25%');
    expect(Number.parseFloat(segments[1].style.width)).toBeCloseTo(75, 5);

    expect(screen.getByText('Monte Carlo Simulation')).toBeTruthy();
    expect(screen.getByText('0.010')).toBeTruthy();
    expect(screen.getByText('0.0015')).toBeTruthy();
    expect(container.querySelector('.stat-value.good')).not.toBeNull();
    expect(screen.getByText('99.1%')).toBeTruthy();
    expect(chartInstances.length).toBe(1);
    expect(chartInstances[0].config.type).toBe('bar');

    unmount();
    expect(chartInstances[0].destroy).toHaveBeenCalled();
  });

  it('supports direct fits field, simple histogram array, and low Cpk class', () => {
    chartInstances.length = 0;
    const { container } = render(
      <TolerancePanel
        data={{
          fits: [{ bore: 'B1', shaft: 'S1', spec: 'H8/f7', fit_type: 'transition' }],
          stackup: { contributors: [{ name: 'C', tolerance: 0.02 }] },
          monte_carlo: {
            cpk: 0.85,
            histogram: [1, 2, 3, 2],
          },
        }}
      />,
    );

    expect(screen.getByText('B1')).toBeTruthy();
    expect(screen.getByText('H8/f7')).toBeTruthy();
    expect(container.querySelector('.stat-value.bad')).not.toBeNull();
    expect(chartInstances.length).toBe(1);
    expect(chartInstances[0].config.data.datasets[0].data).toEqual([1, 2, 3, 2]);
  });
});

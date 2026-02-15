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

import CostPanel from './CostPanel.jsx';

describe('CostPanel', () => {
  it('renders null when data is missing', () => {
    const { container } = render(<CostPanel data={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders totals, savings, comparison, and creates charts', () => {
    chartInstances.length = 0;
    const { unmount } = render(
      <CostPanel
        data={{
          total_cost: 120000,
          unit_cost: 2400,
          breakdown: { material: 30000, machining: 90000 },
          batch_curve: [
            { quantity: 1, unit_cost: 5000 },
            { quantity: 10, unit_cost: 3200 },
          ],
          dfm_savings: { amount: 18000, percent: 15.0 },
          process_comparison: [
            { process: 'machining', material: 30000, machining: 90000, setup: 0, total: 120000, current: true },
            { process: 'casting', material: 25000, machining: 45000, setup: 20000, total: 90000, current: false },
          ],
        }}
      />,
    );

    expect(screen.getByText('Total Cost')).toBeTruthy();
    expect(screen.getAllByText('₩120,000').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('₩2,400 / unit')).toBeTruthy();
    expect(screen.getByText('DFM Improvement Savings')).toBeTruthy();
    expect(screen.getByText('Process Comparison')).toBeTruthy();
    expect(screen.getByText('Batch Price Curve')).toBeTruthy();
    expect(screen.getByText('Cost Breakdown')).toBeTruthy();

    expect(chartInstances.length).toBe(2);
    expect(chartInstances[0].config.type).toBe('doughnut');
    expect(chartInstances[1].config.type).toBe('line');

    unmount();
    expect(chartInstances[0].destroy).toHaveBeenCalled();
    expect(chartInstances[1].destroy).toHaveBeenCalled();
  });

  it('renders without optional sections when data is sparse', () => {
    chartInstances.length = 0;
    render(
      <CostPanel
        data={{
          total_cost: 5000,
          breakdown: {},
          batch_curve: [],
          process_comparison: [],
        }}
      />,
    );

    expect(screen.getByText('₩5,000')).toBeTruthy();
    expect(screen.queryByText('Batch Price Curve')).toBeNull();
    expect(screen.queryByText('DFM Improvement Savings')).toBeNull();
    expect(screen.queryByText('Process Comparison')).toBeNull();
    expect(chartInstances.length).toBe(0);
  });
});

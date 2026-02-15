import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProgressBar from './ProgressBar.jsx';

describe('ProgressBar', () => {
  it('renders null without progress payload', () => {
    const { container } = render(<ProgressBar progress={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders active/done/cached states with minimum width rule', () => {
    const { container } = render(
      <ProgressBar
        progress={{
          stage: 'drawing',
          status: 'start',
          completed: ['create'],
          cached: ['create'],
          total: 5,
        }}
      />,
    );

    const fill = container.querySelector('.progress-fill');
    expect(fill.style.width).toBe('20%');

    const createStep = Array.from(container.querySelectorAll('.progress-step'))
      .find((el) => el.textContent.includes('3D Model'));
    const drawingStep = Array.from(container.querySelectorAll('.progress-step'))
      .find((el) => el.textContent.includes('Drawing'));

    expect(createStep.className).toContain('done');
    expect(createStep.className).toContain('cached');
    expect(createStep.textContent).toContain('⚡');
    expect(drawingStep.className).toContain('active');
  });

  it('renders error and done states', () => {
    const { container, rerender } = render(
      <ProgressBar
        progress={{
          stage: 'dfm',
          status: 'error',
          completed: [],
          cached: [],
          total: 5,
        }}
      />,
    );

    const fillError = container.querySelector('.progress-fill');
    expect(fillError.className).toContain('error');
    expect(fillError.style.width).toBe('5%');

    const failedStep = Array.from(container.querySelectorAll('.progress-step'))
      .find((el) => el.textContent.includes('DFM'));
    expect(failedStep.className).toContain('failed');
    expect(failedStep.textContent).toContain('✗');

    rerender(
      <ProgressBar
        progress={{
          stage: 'cost',
          status: 'done',
          completed: ['create', 'drawing', 'dfm', 'tolerance', 'cost'],
          cached: [],
          total: 5,
        }}
      />,
    );

    const fillDone = container.querySelector('.progress-fill');
    expect(fillDone.style.width).toBe('100%');
  });
});

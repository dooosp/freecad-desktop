import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DfmPanel from './DfmPanel.jsx';

describe('DfmPanel', () => {
  it('renders null when data is missing', () => {
    const { container } = render(<DfmPanel data={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders checks with severity mapping and object summary', () => {
    const { container } = render(
      <DfmPanel
        data={{
          score: 72.4,
          process: 'casting',
          checks: [
            {
              code: 'DFM-01',
              severity: 'error',
              message: 'Wall too thin',
              recommendation: 'Increase thickness',
              value: 0.8,
              threshold: 1.5,
            },
            {
              id: 'DFM-02',
              status: 'warning',
              detail: 'Hole edge distance is small',
              suggestion: 'Move hole inward',
            },
            {
              check_id: 'DFM-99',
              status: 'ok',
            },
          ],
          summary: { errors: 1, warnings: 1, info: 2 },
        }}
      />,
    );

    const fill = container.querySelector('.score-fill');
    expect(fill.style.width).toBe('72.4%');
    expect(fill.style.backgroundColor).toBe('rgb(245, 158, 11)');
    expect(screen.getByText('72/100')).toBeTruthy();
    expect(screen.getByText('casting')).toBeTruthy();

    const cards = container.querySelectorAll('.dfm-card');
    expect(cards.length).toBe(3);
    expect(cards[0].className).toContain('severity-error');
    expect(cards[1].className).toContain('severity-warning');
    expect(cards[2].className).toContain('severity-ok');

    expect(screen.getByText('Wall too thin')).toBeTruthy();
    expect(screen.getByText('Increase thickness')).toBeTruthy();
    expect(screen.getByText(/Measured:/)).toBeTruthy();
    expect(screen.getByText('1 errors')).toBeTruthy();
    expect(screen.getByText('1 warnings')).toBeTruthy();
    expect(screen.getByText('2 info')).toBeTruthy();
  });

  it('supports fallback fields and string summary', () => {
    const { container } = render(
      <DfmPanel
        data={{
          overall_score: 55,
          results: [{ status: 'fail', detail: 'Undercut detected' }],
          summary: 'Multiple geometric issues found',
        }}
      />,
    );

    expect(screen.getByText('55/100')).toBeTruthy();
    expect(screen.getByText('machining')).toBeTruthy();
    expect(screen.getByText('Multiple geometric issues found')).toBeTruthy();

    const status = container.querySelector('.dfm-status');
    expect(status.textContent).toContain('✖');
  });
});

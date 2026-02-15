import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AppEmptyState from './AppEmptyState.jsx';

describe('AppEmptyState', () => {
  it('renders onboarding steps', () => {
    const { container } = render(<AppEmptyState />);
    expect(screen.getByText('Ready to Analyze')).toBeTruthy();
    expect(screen.getByText('Select a config or drop a STEP/TOML file')).toBeTruthy();
    expect(screen.getByText('Adjust process, material, and batch settings')).toBeTruthy();
    expect(screen.getByText('Analyze')).toBeTruthy();
    expect(container.querySelector('.empty-icon').textContent).toContain('⚙');
    expect(container.querySelectorAll('.empty-step').length).toBe(3);
  });
});

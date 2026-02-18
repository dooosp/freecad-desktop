import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiDesignPanel from './AiDesignPanel.jsx';

function createMockBackend(overrides = {}) {
  return {
    runDesign: vi.fn(async () => ({ toml: 'name = "test"', report: { mechanism_type: 'gear', dof: 2 } })),
    runDesignReview: vi.fn(async () => ({ issues: [], correctedToml: 'name = "test"' })),
    runDesignBuild: vi.fn(async () => ({ exports: [{ format: 'step', path: 'out.step' }], configPath: 'configs/generated/test.toml' })),
    ...overrides,
  };
}

describe('AiDesignPanel', () => {
  it('renders input step with disabled generate button when empty', () => {
    const backend = createMockBackend();
    render(<AiDesignPanel backend={backend} />);

    expect(screen.getByPlaceholderText(/planetary gear/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generate Design' }).hasAttribute('disabled')).toBe(true);
  });

  it('enables generate button when description is entered', () => {
    const backend = createMockBackend();
    render(<AiDesignPanel backend={backend} />);

    fireEvent.change(screen.getByPlaceholderText(/planetary gear/i), {
      target: { value: 'A simple bracket' },
    });
    expect(screen.getByRole('button', { name: 'Generate Design' }).hasAttribute('disabled')).toBe(false);
  });

  it('shows TOML editor after generate', async () => {
    const backend = createMockBackend();
    render(<AiDesignPanel backend={backend} />);

    fireEvent.change(screen.getByPlaceholderText(/planetary gear/i), {
      target: { value: 'A gear' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Design' }));

    expect(await screen.findByText('Design Report')).toBeTruthy();
    expect(screen.getByText('gear')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Build 3D' })).toBeTruthy();
  });

  it('shows error when generate fails', async () => {
    const backend = createMockBackend({
      runDesign: vi.fn(async () => { throw new Error('API down'); }),
    });
    render(<AiDesignPanel backend={backend} />);

    fireEvent.change(screen.getByPlaceholderText(/planetary gear/i), {
      target: { value: 'test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Design' }));

    expect(await screen.findByText('API down')).toBeTruthy();
  });
});

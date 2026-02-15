import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ShopProfileModal from './ShopProfileModal.jsx';

describe('ShopProfileModal', () => {
  it('validates required name for new profile and saves edited data', () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const { container } = render(
      <ShopProfileModal
        profile={{ _isNew: true }}
        onSave={onSave}
        onDelete={onDelete}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('New Shop Profile')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(alertSpy).toHaveBeenCalledWith('Profile name is required and cannot be "_default"');
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByPlaceholderText('e.g., small-shop, precision-machining'),
      { target: { value: 'proto_shop' } },
    );
    fireEvent.change(
      screen.getByPlaceholderText('Brief description of this shop profile'),
      { target: { value: 'Prototype-oriented shop profile' } },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Processes' }));
    const processRows = container.querySelectorAll('.toggle-row');
    const machiningCheckbox = processRows[0].querySelector('input[type="checkbox"]');
    fireEvent.click(machiningCheckbox);
    fireEvent.click(machiningCheckbox);
    const processNumbers = processRows[0].querySelectorAll('input[type="number"]');
    fireEvent.change(processNumbers[0], { target: { value: '65000' } });
    fireEvent.change(processNumbers[1], { target: { value: '45000' } });

    fireEvent.click(screen.getByRole('button', { name: 'Materials' }));
    const titaniumRow = screen.getByText('Titanium').closest('.toggle-row');
    const titaniumCheckbox = titaniumRow.querySelector('input[type="checkbox"]');
    fireEvent.click(titaniumCheckbox);
    fireEvent.click(titaniumCheckbox);
    const titaniumCost = titaniumRow.querySelector('input[type="number"]');
    fireEvent.change(titaniumCost, { target: { value: '35000' } });

    fireEvent.click(screen.getByRole('button', { name: 'Tolerances' }));
    const toleranceNumbers = container.querySelectorAll('.modal-body input[type="number"]');
    fireEvent.change(toleranceNumbers[0], { target: { value: '6' } });
    fireEvent.change(toleranceNumbers[1], { target: { value: '11' } });
    const cmmSelect = container.querySelector('.modal-body select');
    fireEvent.change(cmmSelect, { target: { value: 'no' } });

    fireEvent.click(screen.getByRole('button', { name: 'Batch Discounts' }));
    const batchRows = container.querySelectorAll('.discount-table tbody tr');
    const firstRowInputs = batchRows[0].querySelectorAll('input');
    fireEvent.change(firstRowInputs[0], { target: { value: '2' } });
    fireEvent.change(firstRowInputs[1], { target: { value: '12' } });
    fireEvent.change(firstRowInputs[2], { target: { value: '0.05' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'proto_shop',
      description: 'Prototype-oriented shop profile',
      process_capabilities: expect.objectContaining({
        machining: expect.objectContaining({
          rate_per_hour: 65000,
          setup_cost: 45000,
        }),
      }),
      material_rates: expect.objectContaining({
        titanium: expect.objectContaining({
          cost_per_kg: 35000,
        }),
      }),
      tolerance_capabilities: expect.objectContaining({
        min_it_grade: 6,
        max_it_grade: 11,
      }),
      inspection: expect.objectContaining({
        cmm_available: false,
      }),
      batch_discounts: expect.arrayContaining([
        expect.objectContaining({ min_qty: 2, max_qty: 12, discount: 0.05 }),
      ]),
    }));

    alertSpy.mockRestore();
  });

  it('handles delete confirmation for existing profile and close actions', () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm');

    const profile = {
      name: 'sample_precision',
      description: 'Sample',
      process_capabilities: { machining: { available: true, rate_per_hour: 50000, setup_cost: 30000 } },
      material_rates: { SS304: { available: true, cost_per_kg: 5000 } },
      tolerance_capabilities: { min_it_grade: 7, max_it_grade: 12, surface_finish_range: { min: 0.8, max: 6.3 } },
      inspection: { cost_per_tolerance_pair: 5000, cmm_available: true },
      batch_discounts: [{ min_qty: 1, max_qty: 10, discount: 0 }],
    };

    const { container } = render(
      <ShopProfileModal
        profile={profile}
        onSave={onSave}
        onDelete={onDelete}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Edit Profile: sample_precision')).toBeTruthy();
    const nameInput = screen.getByDisplayValue('sample_precision');
    expect(nameInput.hasAttribute('disabled')).toBe(true);

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('sample_precision');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(container.querySelector('.modal-header .btn-icon'));
    expect(onCancel).toHaveBeenCalledTimes(2);

    confirmSpy.mockRestore();
  });
});

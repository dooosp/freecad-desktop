import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReportConfigModal from './ReportConfigModal.jsx';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ReportConfigModal', () => {
  it('loads templates and generates report config with edited fields', async () => {
    const backend = {
      getReportTemplates: vi.fn(async () => [
        { name: 'customer_ko', label: 'Customer KO' },
        { name: 'supplier_en', label: 'Supplier EN' },
      ]),
    };
    const onGenerate = vi.fn(async () => {});
    const onEditTemplate = vi.fn();
    const onNewTemplate = vi.fn();

    render(
      <ReportConfigModal
        templates={[]}
        onGenerate={onGenerate}
        onCancel={vi.fn()}
        backend={backend}
        onEditTemplate={onEditTemplate}
        onNewTemplate={onNewTemplate}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Customer KO' })).toBeTruthy();
    });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'customer_ko' } });
    fireEvent.click(screen.getByTitle('Edit Template'));
    fireEvent.click(screen.getByTitle('New Template'));
    expect(onEditTemplate).toHaveBeenCalledWith('customer_ko');
    expect(onNewTemplate).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText('Part Name'), { target: { value: 'Pump Body' } });
    fireEvent.change(screen.getByPlaceholderText('Drawing Number'), { target: { value: 'DWG-001' } });
    fireEvent.change(screen.getByPlaceholderText('Author'), { target: { value: 'Kim' } });
    fireEvent.click(screen.getByLabelText('Cost Breakdown'));
    fireEvent.change(selects[1], { target: { value: 'en' } });
    fireEvent.click(screen.getByLabelText('Include Disclaimer'));
    fireEvent.click(screen.getByLabelText('Include Signatures'));

    fireEvent.click(screen.getByRole('button', { name: 'Generate Report' }));
    await waitFor(() => {
      expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
        templateName: 'customer_ko',
        metadata: expect.objectContaining({
          part_name: 'Pump Body',
          drawing_number: 'DWG-001',
          author: 'Kim',
        }),
        sections: expect.objectContaining({
          cost: false,
        }),
        options: expect.objectContaining({
          language: 'en',
          disclaimer: false,
          signature: false,
        }),
      }));
    });
  });

  it('uses default template (undefined name), shows loading, and recovers from template fetch failure', async () => {
    const backend = {
      getReportTemplates: vi.fn(async () => {
        throw new Error('template list failed');
      }),
    };
    const deferred = createDeferred();
    const onGenerate = vi.fn(() => deferred.promise);

    render(
      <ReportConfigModal
        templates={[]}
        onGenerate={onGenerate}
        onCancel={vi.fn()}
        backend={backend}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate Report' }));
    expect(screen.getByRole('button', { name: 'Generating...' }).hasAttribute('disabled')).toBe(true);
    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
      templateName: undefined,
    }));

    deferred.resolve();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate Report' }).hasAttribute('disabled')).toBe(false);
    });
  });
});

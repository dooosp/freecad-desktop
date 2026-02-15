import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TemplateEditorModal from './TemplateEditorModal.jsx';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('TemplateEditorModal', () => {
  it('creates a new template across tabs and saves with _isNew flag', async () => {
    const deferred = createDeferred();
    const onSave = vi.fn(() => deferred.promise);
    render(
      <TemplateEditorModal
        template={{ _isNew: true }}
        onSave={onSave}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('New Template')).toBeTruthy();
    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('my_template (alphanumeric, _, -)'), {
      target: { value: 'customer_pack' },
    });
    fireEvent.change(screen.getByPlaceholderText('Customer Report'), {
      target: { value: 'Customer Pack' },
    });
    fireEvent.change(screen.getByPlaceholderText('고객 보고서'), {
      target: { value: '고객 팩' },
    });
    fireEvent.change(screen.getByPlaceholderText('Template description...'), {
      target: { value: 'Template for customer-facing exports' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sections' }));
    const appendixRow = Array.from(document.querySelectorAll('.section-row'))
      .find((row) => row.textContent.includes('Appendix'));
    fireEvent.click(appendixRow.querySelector('input[type="checkbox"]'));
    const orderInputs = document.querySelectorAll('.order-input');
    fireEvent.change(orderInputs[orderInputs.length - 1], { target: { value: '8' } });
    fireEvent.click(screen.getByLabelText('Revision History'));

    fireEvent.click(screen.getByRole('button', { name: 'Title & Sign' }));
    fireEvent.click(screen.getByLabelText('Show Logo'));
    const titleFieldGrid = document.querySelectorAll('.checkbox-grid')[0];
    const authorTitleLabel = Array.from(titleFieldGrid.querySelectorAll('label'))
      .find((label) => label.textContent.trim() === 'author');
    fireEvent.click(authorTitleLabel.querySelector('input[type="checkbox"]'));
    fireEvent.click(screen.getByLabelText('Show Date Field'));

    fireEvent.click(screen.getByRole('button', { name: 'Standards' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. KS B 0401'), { target: { value: 'ISO 286-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('ISO 286-1')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Show Disclaimer'));

    fireEvent.click(screen.getByRole('button', { name: 'Style' }));
    const styleSelects = document.querySelectorAll('.modal-body select');
    fireEvent.change(styleSelects[0], { target: { value: 'A3' } });
    fireEvent.change(styleSelects[1], { target: { value: 'portrait' } });
    fireEvent.change(styleSelects[2], { target: { value: 'Noto Sans KR' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('button', { name: 'Saving...' }).hasAttribute('disabled')).toBe(true);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      _isNew: true,
      name: 'customer_pack',
      label: 'Customer Pack',
      label_ko: '고객 팩',
      sections: expect.objectContaining({
        appendix: expect.objectContaining({
          enabled: true,
          order: 8,
        }),
      }),
      revision_history: expect.objectContaining({
        enabled: true,
      }),
      title_block: expect.objectContaining({
        show_logo: false,
        fields: expect.not.arrayContaining(['author']),
      }),
      signature: expect.objectContaining({
        show_date: false,
      }),
      standards: expect.objectContaining({
        tags: expect.arrayContaining(['ISO 286-1']),
      }),
      disclaimer: expect.objectContaining({
        enabled: false,
      }),
      style: expect.objectContaining({
        page_format: 'A3',
        orientation: 'portrait',
        font: 'Noto Sans KR',
      }),
    }));

    deferred.resolve();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create' }).hasAttribute('disabled')).toBe(false);
    });
  });

  it('edits existing template, supports delete, and closes', async () => {
    const onSave = vi.fn(async () => {});
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    const existing = {
      name: 'supplier_template',
      label: 'Supplier',
      sections: { model_summary: { enabled: true, order: 1 } },
      style: { page_format: 'A4', orientation: 'landscape', font: 'NanumGothic' },
    };

    const { container } = render(
      <TemplateEditorModal
        template={existing}
        onSave={onSave}
        onDelete={onDelete}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Edit: supplier_template')).toBeTruthy();
    const nameInput = screen.getByDisplayValue('supplier_template');
    expect(nameInput.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('supplier_template');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'supplier_template',
    }));
    expect(onSave.mock.calls[0][0]._isNew).toBeUndefined();
    // wait for async save state to settle
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(container.querySelector('.modal-header .btn-icon'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

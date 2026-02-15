import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReportPreview from './ReportPreview.jsx';

describe('ReportPreview', () => {
  it('renders empty state when pdf is not available', () => {
    render(<ReportPreview pdfBase64={null} />);
    expect(screen.getByText(/Generate a report to preview it here/i)).toBeTruthy();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('renders pdf iframe, download link, and configure callback', () => {
    const onConfigure = vi.fn();
    render(<ReportPreview pdfBase64="dGVzdA==" onConfigure={onConfigure} />);

    const configure = screen.getByRole('button', { name: 'Configure' });
    fireEvent.click(configure);
    expect(onConfigure).toHaveBeenCalledTimes(1);

    const downloadLink = screen.getByRole('link', { name: 'Download PDF' });
    expect(downloadLink.getAttribute('download')).toBe('engineering_report.pdf');
    expect(downloadLink.getAttribute('href')).toBe('data:application/pdf;base64,dGVzdA==');

    const iframe = screen.getByTitle('Engineering Report');
    expect(iframe.getAttribute('src')).toBe('data:application/pdf;base64,dGVzdA==');
  });
});

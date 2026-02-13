import React, { useState } from 'react';

export default function ReportPreview({ pdfBase64 }) {
  const [page, setPage] = useState(1);

  if (!pdfBase64) {
    return (
      <div className="report-preview empty">
        <p>Generate a report to preview it here</p>
      </div>
    );
  }

  const pdfUrl = `data:application/pdf;base64,${pdfBase64}`;

  return (
    <div className="report-preview">
      <div className="viewer-toolbar">
        <a
          className="btn btn-secondary"
          href={pdfUrl}
          download="engineering_report.pdf"
        >
          Download PDF
        </a>
      </div>
      <div className="pdf-container">
        <iframe
          src={pdfUrl}
          title="Engineering Report"
          className="pdf-iframe"
        />
      </div>
    </div>
  );
}

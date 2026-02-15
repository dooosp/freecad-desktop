import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DrawingViewer from './DrawingViewer.jsx';

describe('DrawingViewer', () => {
  it('renders svg content and QA badge style thresholds', () => {
    const { container, rerender } = render(
      <DrawingViewer svgContent="<svg><text>Drawing A</text></svg>" qa={{ score: 82 }} />,
    );

    expect(screen.getByText('Drawing A')).toBeTruthy();
    const badge = container.querySelector('.qa-badge');
    expect(badge.textContent).toContain('QA: 82/100');
    expect(badge.className).toContain('good');

    rerender(<DrawingViewer svgContent="<svg><text>Drawing B</text></svg>" qa={{ score: 65 }} />);
    expect(container.querySelector('.qa-badge').className).toContain('warn');

    rerender(<DrawingViewer svgContent="<svg><text>Drawing C</text></svg>" qa={{ score: 40 }} />);
    expect(container.querySelector('.qa-badge').className).toContain('bad');
  });

  it('supports zoom buttons, wheel zoom, panning, and reset', () => {
    const { container } = render(
      <DrawingViewer svgContent="<svg><text>PanZoom</text></svg>" qa={null} />,
    );

    const zoomLabel = () => container.querySelector('.zoom-label').textContent;
    const svgContainer = container.querySelector('.svg-container');
    const content = container.querySelector('.svg-content');

    expect(zoomLabel()).toBe('100%');
    expect(content.style.transform).toContain('scale(1)');
    expect(content.style.cursor).toBe('grab');

    fireEvent.click(screen.getByTitle('Zoom In'));
    expect(zoomLabel()).toBe('120%');

    fireEvent.click(screen.getByTitle('Zoom Out'));
    expect(zoomLabel()).toBe('96%');

    fireEvent.wheel(svgContainer, { deltaY: -120 });
    expect(zoomLabel()).toBe('106%');

    fireEvent.mouseDown(svgContainer, { button: 0, clientX: 20, clientY: 30 });
    fireEvent.mouseMove(svgContainer, { clientX: 40, clientY: 50 });
    expect(content.style.transform).toContain('translate(20px, 20px)');
    expect(content.style.cursor).toBe('grabbing');

    fireEvent.mouseUp(svgContainer);
    expect(content.style.cursor).toBe('grab');

    fireEvent.click(screen.getByTitle('Reset'));
    expect(zoomLabel()).toBe('100%');
    expect(content.style.transform).toContain('translate(0px, 0px) scale(1)');
  });
});

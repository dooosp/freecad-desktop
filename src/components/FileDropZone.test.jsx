import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FileDropZone from './FileDropZone.jsx';

function createFile(name, path) {
  const file = new File(['x'], name, { type: 'text/plain' });
  if (path) {
    Object.defineProperty(file, 'path', {
      configurable: true,
      value: path,
    });
  }
  return file;
}

describe('FileDropZone', () => {
  it('handles drag/drop states and accepts supported files', () => {
    const onFileSelect = vi.fn();
    const { container } = render(<FileDropZone onFileSelect={onFileSelect} />);
    const zone = container.querySelector('.drop-zone');

    expect(screen.getByText(/Drop STEP, TOML, or \.fcstudio/i)).toBeTruthy();

    fireEvent.dragOver(zone);
    expect(zone.className).toContain('dragging');
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain('dragging');

    const file = createFile('sample.step', '/tmp/sample.step');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(onFileSelect).toHaveBeenCalledWith('/tmp/sample.step', file);
    expect(screen.getByText('sample.step')).toBeTruthy();
  });

  it('ignores unsupported dropped files', () => {
    const onFileSelect = vi.fn();
    const { container } = render(<FileDropZone onFileSelect={onFileSelect} />);
    const zone = container.querySelector('.drop-zone');

    fireEvent.drop(zone, { dataTransfer: { files: [createFile('notes.txt', '/tmp/notes.txt')] } });
    expect(onFileSelect).not.toHaveBeenCalled();
  });

  it('opens hidden input on click and handles file input change', () => {
    const onFileSelect = vi.fn();
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const { container } = render(<FileDropZone onFileSelect={onFileSelect} />);
    const zone = container.querySelector('.drop-zone');
    const input = container.querySelector('input[type="file"]');

    fireEvent.click(zone);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const fcstudio = createFile('demo.fcstudio', '/tmp/demo.fcstudio');
    fireEvent.change(input, { target: { files: [fcstudio] } });
    expect(onFileSelect).toHaveBeenCalledWith('/tmp/demo.fcstudio', fcstudio);
    expect(screen.getByText('demo.fcstudio')).toBeTruthy();

    clickSpy.mockRestore();
  });
});

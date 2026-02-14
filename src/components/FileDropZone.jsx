import React, { useState, useCallback, useRef } from 'react';

export default function FileDropZone({ onFileSelect }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const inputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const name = file.name;
      const lower = name.toLowerCase();
      if (lower.endsWith('.toml') || lower.endsWith('.step') || lower.endsWith('.stp') || lower.endsWith('.fcstudio')) {
        setSelectedFile(name);
        // For Tauri, we'd use the file path; for web dev, use the name
        onFileSelect(file.path || name, file);
      }
    }
  }, [onFileSelect]);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileInput = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.toml') || lower.endsWith('.step') || lower.endsWith('.stp') || lower.endsWith('.fcstudio')) {
        setSelectedFile(file.name);
        onFileSelect(file.path || file.name, file);
      }
    }
  }, [onFileSelect]);

  return (
    <div
      className={`drop-zone ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".toml,.step,.stp,.fcstudio"
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
      {selectedFile ? (
        <div className="drop-zone-selected">
          <span className="file-icon">&#128196;</span>
          <span className="file-name">{selectedFile}</span>
        </div>
      ) : (
        <div className="drop-zone-empty">
          <span className="drop-icon">&#8693;</span>
          <span>Drop STEP, TOML, or .fcstudio</span>
        </div>
      )}
    </div>
  );
}

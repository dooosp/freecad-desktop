import React, { useState, useRef, useCallback, useEffect } from 'react';

export default function DrawingViewer({ svgContent, qa }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.1, Math.min(5, prev * delta)));
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  }, [offset]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
      return () => el.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  return (
    <div className="drawing-viewer">
      <div className="viewer-toolbar">
        <button className="btn-icon" onClick={() => setScale(s => Math.min(5, s * 1.2))} title="Zoom In">+</button>
        <button className="btn-icon" onClick={() => setScale(s => Math.max(0.1, s * 0.8))} title="Zoom Out">-</button>
        <button className="btn-icon" onClick={handleReset} title="Reset">&#8634;</button>
        <span className="zoom-label">{Math.round(scale * 100)}%</span>
        {qa && (
          <span className={`qa-badge ${qa.score >= 80 ? 'good' : qa.score >= 60 ? 'warn' : 'bad'}`}>
            QA: {qa.score}/100
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        className="svg-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="svg-content"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            cursor: isPanning ? 'grabbing' : 'grab',
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>
    </div>
  );
}

import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export default function TolerancePanel({ data }) {
  const histRef = useRef(null);
  const chartInstance = useRef(null);

  if (!data) return null;

  const fits = data.fits || data.fit_pairs || [];
  const stackup = data.stackup || data.tolerance_stackup || null;
  const monteCarlo = data.monte_carlo || null;

  // Monte Carlo histogram
  useEffect(() => {
    if (!monteCarlo?.histogram || !histRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const bins = monteCarlo.histogram.bins || monteCarlo.histogram;
    const labels = bins.map((_, i) => i);
    const values = Array.isArray(bins[0]) ? bins.map(b => b[1]) : bins;

    chartInstance.current = new Chart(histRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Monte Carlo Distribution',
          data: values,
          backgroundColor: 'rgba(102, 153, 204, 0.6)',
          borderColor: 'rgba(102, 153, 204, 1)',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: { title: { display: true, text: 'Dimension (mm)', color: '#999' }, ticks: { color: '#999' } },
          y: { title: { display: true, text: 'Frequency', color: '#999' }, ticks: { color: '#999' } },
        },
      },
    });

    return () => {
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, [monteCarlo]);

  return (
    <div className="tolerance-panel">
      {/* Fit Pairs Table */}
      {fits.length > 0 && (
        <div className="tol-section">
          <h4>Fit Pairs</h4>
          <div className="tol-table-wrap">
            <table className="tol-table">
              <thead>
                <tr>
                  <th>Bore</th>
                  <th>Shaft</th>
                  <th>Spec</th>
                  <th>Fit Type</th>
                  <th>Min Clear.</th>
                  <th>Max Clear.</th>
                </tr>
              </thead>
              <tbody>
                {fits.map((fit, i) => (
                  <tr key={i}>
                    <td>{fit.bore || fit.hole}</td>
                    <td>{fit.shaft}</td>
                    <td>{fit.spec || fit.designation || '-'}</td>
                    <td>
                      <span className={`fit-type fit-${(fit.fit_type || fit.type || '').toLowerCase()}`}>
                        {fit.fit_type || fit.type || '-'}
                      </span>
                    </td>
                    <td>{fit.min_clearance?.toFixed(3) ?? '-'}</td>
                    <td>{fit.max_clearance?.toFixed(3) ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tolerance Stack-up */}
      {stackup && (
        <div className="tol-section">
          <h4>Tolerance Stack-up</h4>
          <div className="stackup-bar">
            {(stackup.contributors || []).map((c, i) => (
              <div
                key={i}
                className="stackup-segment"
                style={{
                  width: `${(Math.abs(c.tolerance) / (stackup.total || 1)) * 100}%`,
                  backgroundColor: `hsl(${(i * 60) % 360}, 60%, 50%)`,
                }}
                title={`${c.name}: ±${c.tolerance}`}
              >
                <span className="stackup-label">{c.name}</span>
              </div>
            ))}
          </div>
          <div className="stackup-total">
            Total: ±{stackup.total?.toFixed(3) || '-'} mm
          </div>
        </div>
      )}

      {/* Monte Carlo */}
      {monteCarlo && (
        <div className="tol-section">
          <h4>Monte Carlo Simulation</h4>
          <div className="mc-stats">
            <div className="stat-card">
              <span className="stat-label">Mean</span>
              <span className="stat-value">{monteCarlo.mean?.toFixed(3) ?? '-'}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Std Dev</span>
              <span className="stat-value">{monteCarlo.std_dev?.toFixed(4) ?? '-'}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Cpk</span>
              <span className={`stat-value ${(monteCarlo.cpk ?? 0) >= 1.33 ? 'good' : 'bad'}`}>
                {monteCarlo.cpk?.toFixed(2) ?? '-'}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Yield</span>
              <span className="stat-value">{monteCarlo.yield_pct?.toFixed(1) ?? '-'}%</span>
            </div>
          </div>
          <div className="mc-chart">
            <canvas ref={histRef} />
          </div>
        </div>
      )}
    </div>
  );
}

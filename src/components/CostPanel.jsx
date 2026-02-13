import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export default function CostPanel({ data }) {
  const pieRef = useRef(null);
  const curveRef = useRef(null);
  const pieChart = useRef(null);
  const curveChart = useRef(null);

  if (!data) return null;

  const breakdown = data.breakdown || {};
  const batchCurve = data.batch_curve || [];
  const totalCost = data.total_cost || 0;
  const dfmSavings = data.dfm_savings || null;
  const processComparison = data.process_comparison || [];

  // Cost breakdown pie chart
  useEffect(() => {
    if (!pieRef.current || !Object.keys(breakdown).length) return;
    if (pieChart.current) pieChart.current.destroy();

    const labels = Object.keys(breakdown).map(k => {
      const map = { material: 'Material', machining: 'Machining', setup: 'Setup', inspection: 'Inspection', casting: 'Casting', sheet_metal: 'Sheet Metal', printing: '3D Printing' };
      return map[k] || k;
    });
    const values = Object.values(breakdown);
    const colors = ['#6699cc', '#ee6644', '#44bb88', '#ddaa33', '#9966cc', '#ff8899', '#66ccaa'];

    pieChart.current = new Chart(pieRef.current, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors.slice(0, values.length),
          borderWidth: 2,
          borderColor: '#1a1a2e',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#ccc', font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.raw;
                const pct = ((val / totalCost) * 100).toFixed(1);
                return `${ctx.label}: ₩${val.toLocaleString()} (${pct}%)`;
              },
            },
          },
        },
      },
    });

    return () => { if (pieChart.current) pieChart.current.destroy(); };
  }, [breakdown, totalCost]);

  // Batch curve
  useEffect(() => {
    if (!curveRef.current || !batchCurve.length) return;
    if (curveChart.current) curveChart.current.destroy();

    curveChart.current = new Chart(curveRef.current, {
      type: 'line',
      data: {
        labels: batchCurve.map(b => b.quantity),
        datasets: [{
          label: 'Unit Cost (₩)',
          data: batchCurve.map(b => b.unit_cost),
          borderColor: '#6699cc',
          backgroundColor: 'rgba(102,153,204,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#6699cc',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `₩${ctx.raw.toLocaleString()} / unit`,
            },
          },
        },
        scales: {
          x: { title: { display: true, text: 'Batch Size', color: '#999' }, ticks: { color: '#999' } },
          y: { title: { display: true, text: 'Unit Cost (₩)', color: '#999' }, ticks: { color: '#999' } },
        },
      },
    });

    return () => { if (curveChart.current) curveChart.current.destroy(); };
  }, [batchCurve]);

  return (
    <div className="cost-panel">
      {/* Total Cost */}
      <div className="cost-total">
        <span className="cost-label">Total Cost</span>
        <span className="cost-value">₩{totalCost.toLocaleString()}</span>
        {data.unit_cost && (
          <span className="cost-unit">₩{data.unit_cost.toLocaleString()} / unit</span>
        )}
      </div>

      <div className="cost-charts">
        {/* Pie Chart */}
        <div className="chart-container">
          <h4>Cost Breakdown</h4>
          <div className="chart-canvas">
            <canvas ref={pieRef} />
          </div>
        </div>

        {/* Batch Curve */}
        {batchCurve.length > 0 && (
          <div className="chart-container">
            <h4>Batch Price Curve</h4>
            <div className="chart-canvas">
              <canvas ref={curveRef} />
            </div>
          </div>
        )}
      </div>

      {/* DFM Savings */}
      {dfmSavings && (
        <div className="cost-savings">
          <h4>DFM Improvement Savings</h4>
          <p>
            Resolving DFM issues could save{' '}
            <strong>₩{dfmSavings.amount.toLocaleString()}</strong>{' '}
            ({dfmSavings.percent.toFixed(1)}% reduction)
          </p>
        </div>
      )}

      {/* Process Comparison */}
      {processComparison.length > 0 && (
        <div className="cost-comparison">
          <h4>Process Comparison</h4>
          <table className="tol-table">
            <thead>
              <tr>
                <th>Process</th>
                <th>Material</th>
                <th>Machining</th>
                <th>Setup</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {processComparison.map((p, i) => (
                <tr key={i} className={p.current ? 'current-process' : ''}>
                  <td>{p.process}</td>
                  <td>₩{(p.material || 0).toLocaleString()}</td>
                  <td>₩{(p.machining || 0).toLocaleString()}</td>
                  <td>₩{(p.setup || 0).toLocaleString()}</td>
                  <td><strong>₩{(p.total || 0).toLocaleString()}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

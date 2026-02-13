import { useState, useCallback } from 'react';

const API_BASE = '/api';

export function useBackend() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  const call = useCallback(async (endpoint, body = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const get = useCallback(async (endpoint) => {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`);
      return await res.json();
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  const analyze = useCallback((configPath, options = {}) => {
    return call('/analyze', { configPath, options });
  }, [call]);

  const inspect = useCallback((body) => call('/inspect', body), [call]);
  const create = useCallback((body) => call('/create', body), [call]);
  const runDfm = useCallback((configPath, process) => call('/dfm', { configPath, process }), [call]);
  const runDrawing = useCallback((configPath, preset) => call('/drawing', { configPath, preset }), [call]);
  const runTolerance = useCallback((configPath) => call('/tolerance', { configPath }), [call]);
  const runCost = useCallback((configPath, opts) => call('/cost', { configPath, ...opts }), [call]);
  const generateReport = useCallback((configPath, opts) => call('/report', { configPath, ...opts }), [call]);
  const getExamples = useCallback(() => get('/examples'), [get]);

  return {
    loading, error, progress,
    analyze, inspect, create,
    runDfm, runDrawing, runTolerance, runCost,
    generateReport, getExamples,
    setError,
  };
}

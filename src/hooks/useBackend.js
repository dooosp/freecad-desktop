import { useState, useCallback, useRef } from 'react';

const API_BASE = '/api';

export function useBackend() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null); // { stage, status, completed[], total }
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

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

  /**
   * SSE-based analyze with real-time progress updates.
   * Returns the full results object after the stream completes.
   */
  const analyze = useCallback((configPath, options = {}) => {
    return new Promise((resolve, reject) => {
      setLoading(true);
      setError(null);
      setProgress({ stage: null, status: 'starting', completed: [], total: 5 });

      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configPath, options }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${res.status}`);
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          const completed = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE events from buffer
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete line in buffer

            let currentEvent = null;
            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ') && currentEvent) {
                const data = JSON.parse(line.slice(6));

                if (currentEvent === 'stage') {
                  if (data.status === 'done') {
                    completed.push(data.stage);
                  }
                  setProgress({
                    stage: data.stage,
                    status: data.status,
                    completed: [...completed],
                    total: 5,
                    error: data.error || null,
                  });
                } else if (currentEvent === 'complete') {
                  setProgress({ stage: 'done', status: 'done', completed, total: 5 });
                  setLoading(false);
                  resolve(data);
                } else if (currentEvent === 'error') {
                  setProgress({ stage: 'error', status: 'error', completed, total: 5 });
                  setLoading(false);
                  setError(data.error);
                  reject(new Error(data.error));
                }
                currentEvent = null;
              } else if (line === '') {
                currentEvent = null;
              }
            }
          }
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          setError(err.message);
          setLoading(false);
          setProgress(null);
          reject(err);
        });
    });
  }, []);

  const cancelAnalyze = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setProgress(null);
  }, []);

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
    analyze, cancelAnalyze,
    inspect, create,
    runDfm, runDrawing, runTolerance, runCost,
    generateReport, getExamples,
    setError,
  };
}

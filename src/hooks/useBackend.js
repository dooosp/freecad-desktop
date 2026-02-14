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
      let settled = false;

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
          if (!res.body) {
            throw new Error('Analyze stream body is empty');
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
                let data;
                try {
                  data = JSON.parse(line.slice(6));
                } catch {
                  currentEvent = null;
                  continue;
                }

                if (currentEvent === 'stage') {
                  if (data.status === 'done' && data.stage && !completed.includes(data.stage)) {
                    completed.push(data.stage);
                    setError(null);
                  }
                  if (data.status === 'error' && data.error) {
                    setError(`[${data.stage}] ${data.error}`);
                  }
                  setProgress({
                    stage: data.stage,
                    status: data.status,
                    completed: [...completed],
                    total: 5,
                    error: data.error || null,
                  });
                } else if (currentEvent === 'complete') {
                  settled = true;
                  setProgress({ stage: 'done', status: 'done', completed, total: 5 });
                  setLoading(false);
                  abortRef.current = null;
                  resolve(data);
                } else if (currentEvent === 'error') {
                  settled = true;
                  setProgress({ stage: 'error', status: 'error', completed, total: 5 });
                  setLoading(false);
                  abortRef.current = null;
                  setError(data.error);
                  reject(new Error(data.error));
                }
                currentEvent = null;
              } else if (line === '') {
                currentEvent = null;
              }
            }
          }

          if (!settled) {
            throw new Error('Analyze stream ended unexpectedly');
          }
        })
        .catch((err) => {
          abortRef.current = null;
          if (err.name === 'AbortError') {
            setLoading(false);
            setProgress(null);
            reject(err);
            return;
          }
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

  const importStep = useCallback(async (fileOrPath) => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (typeof fileOrPath === 'string') {
        // Tauri mode: send file path as JSON
        res = await fetch(`${API_BASE}/step/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: fileOrPath }),
        });
      } else {
        // Web mode: send as FormData
        const form = new FormData();
        form.append('file', fileOrPath);
        res = await fetch(`${API_BASE}/step/import`, { method: 'POST', body: form });
      }
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

  const saveStepConfig = useCallback((configPath, tomlString) => {
    return call('/step/save-config', { configPath, tomlString });
  }, [call]);

  return {
    loading, error, progress,
    analyze, cancelAnalyze,
    inspect, create,
    runDfm, runDrawing, runTolerance, runCost,
    generateReport, getExamples,
    importStep, saveStepConfig,
    setError,
  };
}

import { useState, useCallback, useRef } from 'react';

const API_BASE = '/api';

export function useBackend() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null); // { stage, status, completed[], total }
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const call = useCallback(async (endpoint, body = {}, method = 'POST') => {
    setLoading(true);
    setError(null);
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (method !== 'GET' && method !== 'DELETE') {
        options.body = JSON.stringify(body);
      }
      const res = await fetch(`${API_BASE}${endpoint}`, options);
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

      const { profileName, ...pipelineOptions } = options;

      fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configPath,
          profileName: profileName || undefined,
          options: pipelineOptions,
        }),
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
  const runDfm = useCallback((configPath, process, profileName) => {
    return call('/dfm', { configPath, process, profileName: profileName || undefined });
  }, [call]);
  const runDrawing = useCallback((configPath, preset) => call('/drawing', { configPath, preset }), [call]);
  const runTolerance = useCallback((configPath) => call('/tolerance', { configPath }), [call]);
  const runCost = useCallback((configPath, opts) => {
    return call('/cost', { configPath, ...opts });
  }, [call]);
  const generateReport = useCallback((configPath, opts) => {
    return call('/report', {
      configPath,
      analysisResults: opts.analysisResults,
      templateName: opts.templateName || undefined,
      profileName: opts.profileName || undefined,
      metadata: opts.metadata || undefined,
      sections: opts.sections || undefined,
      options: opts.options || undefined,
    });
  }, [call]);
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

  // Profile APIs
  const getProfiles = useCallback(() => get('/profiles'), [get]);
  const getProfile = useCallback((name) => get(`/profiles/${name}`), [get]);
  const saveProfile = useCallback((profile) => {
    const payload = { ...profile };
    const isNew = payload._isNew;
    delete payload._isNew;
    return call(`/profiles${isNew ? '' : '/' + payload.name}`, payload, isNew ? 'POST' : 'PUT');
  }, [call]);
  const deleteProfile = useCallback((name) => call(`/profiles/${name}`, {}, 'DELETE'), [call]);

  // Report Template APIs
  const getReportTemplates = useCallback(() => get('/report-templates'), [get]);
  const getReportTemplate = useCallback((name) => get(`/report-templates/${name}`), [get]);
  const saveReportTemplate = useCallback((tpl) => {
    const payload = { ...tpl };
    const isNew = payload._isNew;
    delete payload._isNew;
    return call(`/report-templates${isNew ? '' : '/' + payload.name}`, payload, isNew ? 'POST' : 'PUT');
  }, [call]);
  const deleteReportTemplate = useCallback((name) => call(`/report-templates/${name}`, {}, 'DELETE'), [call]);

  // Export Pack
  const exportPack = useCallback(async (options) => {
    const res = await call('/export-pack', options);
    // Convert base64 to blob and trigger download
    if (res.zipBase64) {
      const binary = atob(res.zipBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || 'export-pack.zip';
      a.click();
      URL.revokeObjectURL(url);
    }
    return res;
  }, [call]);

  return {
    loading, error, progress,
    analyze, cancelAnalyze,
    inspect, create,
    runDfm, runDrawing, runTolerance, runCost,
    generateReport, getExamples,
    importStep, saveStepConfig,
    getProfiles, getProfile, saveProfile, deleteProfile,
    getReportTemplates, getReportTemplate, saveReportTemplate, deleteReportTemplate,
    exportPack,
    setError,
  };
}

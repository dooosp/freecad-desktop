import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackend } from './useBackend.js';

function createJsonResponse(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return data;
    },
  };
}

function createSseResponse(events, { ok = true, status = 200 } = {}) {
  const encoder = new TextEncoder();
  const chunks = events.map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
  let index = 0;

  return {
    ok,
    status,
    async json() {
      return {};
    },
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) {
              return { done: true, value: undefined };
            }
            const value = encoder.encode(chunks[index]);
            index += 1;
            return { done: false, value };
          },
        };
      },
    },
  };
}

const originalFetch = globalThis.fetch;
const originalAtob = globalThis.atob;
const originalCreateObjectURL = globalThis.URL?.createObjectURL;
const originalRevokeObjectURL = globalThis.URL?.revokeObjectURL;
const originalCreateElement = globalThis.document?.createElement?.bind(globalThis.document);

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.atob = originalAtob;
  if (globalThis.URL) {
    globalThis.URL.createObjectURL = originalCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
  }
  if (globalThis.document && originalCreateElement) {
    globalThis.document.createElement = originalCreateElement;
  }
});

describe('useBackend', () => {
  it('parses analyze SSE stage/complete events and resolves with results', async () => {
    const analyzePayload = {
      stages: ['create', 'drawing'],
      errors: [],
      drawing: { drawing_paths: [{ format: 'svg', path: 'output/a.svg' }] },
    };
    globalThis.fetch.mockResolvedValue(
      createSseResponse([
        { event: 'stage', data: { stage: 'create', status: 'done' } },
        { event: 'stage', data: { stage: 'drawing', status: 'done', cached: true } },
        { event: 'complete', data: analyzePayload },
      ])
    );

    const { result } = renderHook(() => useBackend());

    let resolved;
    await act(async () => {
      resolved = await result.current.analyze('configs/examples/ks_flange.toml', {
        process: 'machining',
        profileName: 'sample_precision',
      });
    });

    expect(resolved).toEqual(analyzePayload);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/analyze',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const payload = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(payload).toEqual({
      configPath: 'configs/examples/ks_flange.toml',
      profileName: 'sample_precision',
      options: { process: 'machining' },
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.progress).toEqual({
      stage: 'done',
      status: 'done',
      completed: ['create', 'drawing'],
      cached: ['drawing'],
      total: 5,
    });
  });

  it('rejects analyze when SSE emits error event and keeps error/progress state', async () => {
    globalThis.fetch.mockResolvedValue(
      createSseResponse([
        { event: 'stage', data: { stage: 'create', status: 'done' } },
        { event: 'error', data: { error: 'pipeline exploded' } },
      ])
    );

    const { result } = renderHook(() => useBackend());
    let caught;

    await act(async () => {
      try {
        await result.current.analyze('configs/examples/ks_flange.toml');
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeTruthy();
    expect(caught.message).toBe('pipeline exploded');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('pipeline exploded');
    expect(result.current.progress).toEqual({
      stage: 'error',
      status: 'error',
      completed: ['create'],
      cached: [],
      total: 5,
    });
  });

  it('cancels analyze via AbortController and resets loading/progress', async () => {
    globalThis.fetch.mockImplementation((_url, options = {}) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const { result } = renderHook(() => useBackend());

    let analyzePromise;
    act(() => {
      analyzePromise = result.current.analyze('configs/examples/ks_flange.toml');
    });

    act(() => {
      result.current.cancelAnalyze();
    });

    let caught;
    await act(async () => {
      try {
        await analyzePromise;
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeTruthy();
    expect(caught.name).toBe('AbortError');
    expect(result.current.loading).toBe(false);
    expect(result.current.progress).toBe(null);
  });

  it('handles non-stream analyze HTTP error payload', async () => {
    globalThis.fetch.mockResolvedValue(
      createJsonResponse({ error: 'bad request' }, { ok: false, status: 400 })
    );

    const { result } = renderHook(() => useBackend());
    let caught;

    await act(async () => {
      try {
        await result.current.analyze('configs/examples/invalid.toml');
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeTruthy();
    expect(caught.message).toBe('bad request');
    expect(result.current.error).toBe('bad request');
    expect(result.current.loading).toBe(false);
    expect(result.current.progress).toBe(null);
  });

  it('imports STEP in tauri path mode and web file mode', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(createJsonResponse({ success: true, configPath: 'configs/imports/path.toml' }))
      .mockResolvedValueOnce(createJsonResponse({ success: true, configPath: 'configs/imports/file.toml' }));

    const { result } = renderHook(() => useBackend());

    let first;
    let second;
    await act(async () => {
      first = await result.current.importStep('/tmp/input.step');
      const file = new File(['STEP'], 'input.step', { type: 'application/step' });
      second = await result.current.importStep(file);
    });

    expect(first).toEqual({ success: true, configPath: 'configs/imports/path.toml' });
    expect(second).toEqual({ success: true, configPath: 'configs/imports/file.toml' });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      '/api/step/import',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toEqual({ filePath: '/tmp/input.step' });

    expect(globalThis.fetch.mock.calls[1][0]).toBe('/api/step/import');
    expect(globalThis.fetch.mock.calls[1][1].method).toBe('POST');
    expect(globalThis.fetch.mock.calls[1][1].body).toBeInstanceOf(FormData);
    expect(globalThis.fetch.mock.calls[1][1].headers).toBeUndefined();
  });

  it('surfaces importStep failure through error state', async () => {
    globalThis.fetch.mockResolvedValue(createJsonResponse({ error: 'step import failed' }, { ok: false, status: 500 }));
    const { result } = renderHook(() => useBackend());

    let caught;
    await act(async () => {
      try {
        await result.current.importStep('/tmp/fail.step');
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeTruthy();
    expect(caught.message).toBe('step import failed');
    expect(result.current.error).toBe('step import failed');
    expect(result.current.loading).toBe(false);
  });

  it('maps CRUD helper methods to correct API routes and verbs', async () => {
    globalThis.fetch.mockResolvedValue(createJsonResponse({ success: true }));
    const { result } = renderHook(() => useBackend());

    await act(async () => {
      await result.current.saveProfile({ _isNew: true, name: 'shop_a', label: 'Shop A' });
      await result.current.saveProfile({ name: 'shop_a', label: 'Shop A2' });
      await result.current.deleteProfile('shop_a');
      await result.current.compareProfiles({ configPath: 'configs/examples/ks_flange.toml' });

      await result.current.saveReportTemplate({ _isNew: true, name: 'tpl_a', label: 'Template A' });
      await result.current.saveReportTemplate({ name: 'tpl_a', label: 'Template A2' });
      await result.current.deleteReportTemplate('tpl_a');

      await result.current.saveProject({ name: 'proj_a' });
      await result.current.openProject('/tmp/proj_a.fcstudio');
      await result.current.clearCache('drawing');
    });

    const compact = globalThis.fetch.mock.calls.map(([url, options]) => ({
      url,
      method: options?.method || 'GET',
      body: options?.body ? JSON.parse(options.body) : null,
    }));

    expect(compact).toEqual([
      { url: '/api/profiles', method: 'POST', body: { name: 'shop_a', label: 'Shop A' } },
      { url: '/api/profiles/shop_a', method: 'PUT', body: { name: 'shop_a', label: 'Shop A2' } },
      { url: '/api/profiles/shop_a', method: 'DELETE', body: null },
      { url: '/api/profiles/compare', method: 'POST', body: { configPath: 'configs/examples/ks_flange.toml' } },
      { url: '/api/report-templates', method: 'POST', body: { name: 'tpl_a', label: 'Template A' } },
      { url: '/api/report-templates/tpl_a', method: 'PUT', body: { name: 'tpl_a', label: 'Template A2' } },
      { url: '/api/report-templates/tpl_a', method: 'DELETE', body: null },
      { url: '/api/project/save', method: 'POST', body: { projectData: { name: 'proj_a' } } },
      { url: '/api/project/open', method: 'POST', body: { filePath: '/tmp/proj_a.fcstudio' } },
      { url: '/api/cache?stage=drawing', method: 'DELETE', body: null },
    ]);
  });

  it('calls pipeline and utility helpers with expected API payloads', async () => {
    globalThis.fetch.mockResolvedValue(createJsonResponse({ success: true }));
    const { result } = renderHook(() => useBackend());

    await act(async () => {
      await result.current.inspect({ file: 'a.step' });
      await result.current.create({ configPath: 'configs/examples/ks_flange.toml' });
      await result.current.runDfm('configs/examples/ks_flange.toml', 'machining', 'sample_precision', 'KS');
      await result.current.runDrawing('configs/examples/ks_flange.toml', 'ks_standard', 'ASME');
      await result.current.runTolerance('configs/examples/ks_flange.toml', 'KS');
      await result.current.runCost('configs/examples/ks_flange.toml', { process: 'machining', batchSize: 5 });
      await result.current.generateReport('configs/examples/ks_flange.toml', {
        analysisResults: { dfm: { score: 90 } },
        templateName: 'tpl_a',
        profileName: 'sample_precision',
        metadata: { part_name: 'PartA' },
        sections: { drawing: true },
        options: { language: 'ko' },
      });
      await result.current.saveStepConfig('configs/imports/a.toml', 'name = "a"\n');

      await result.current.getExamples();
      await result.current.getProfiles();
      await result.current.getProfile('sample_precision');
      await result.current.getReportTemplates();
      await result.current.getReportTemplate('tpl_a');
      await result.current.getRecentProjects();
      await result.current.getDiagnostics();
      await result.current.getCacheStats();

      await result.current.saveProject({ name: 'proj_a' });
      await result.current.openProject('/tmp/proj_a.fcstudio');
      await result.current.clearCache();
    });

    const compact = globalThis.fetch.mock.calls.map(([url, options]) => ({
      url,
      method: options?.method || 'GET',
      body: options?.body ? JSON.parse(options.body) : null,
    }));

    expect(compact).toEqual([
      { url: '/api/inspect', method: 'POST', body: { file: 'a.step' } },
      { url: '/api/create', method: 'POST', body: { configPath: 'configs/examples/ks_flange.toml' } },
      {
        url: '/api/dfm',
        method: 'POST',
        body: {
          configPath: 'configs/examples/ks_flange.toml',
          process: 'machining',
          profileName: 'sample_precision',
          standard: 'KS',
        },
      },
      {
        url: '/api/drawing',
        method: 'POST',
        body: {
          configPath: 'configs/examples/ks_flange.toml',
          preset: 'ks_standard',
          standard: 'ASME',
        },
      },
      {
        url: '/api/tolerance',
        method: 'POST',
        body: { configPath: 'configs/examples/ks_flange.toml', standard: 'KS' },
      },
      {
        url: '/api/cost',
        method: 'POST',
        body: { configPath: 'configs/examples/ks_flange.toml', process: 'machining', batchSize: 5 },
      },
      {
        url: '/api/report',
        method: 'POST',
        body: {
          configPath: 'configs/examples/ks_flange.toml',
          analysisResults: { dfm: { score: 90 } },
          templateName: 'tpl_a',
          profileName: 'sample_precision',
          metadata: { part_name: 'PartA' },
          sections: { drawing: true },
          options: { language: 'ko' },
        },
      },
      {
        url: '/api/step/save-config',
        method: 'POST',
        body: {
          configPath: 'configs/imports/a.toml',
          tomlString: 'name = "a"\n',
        },
      },
      { url: '/api/examples', method: 'GET', body: null },
      { url: '/api/profiles', method: 'GET', body: null },
      { url: '/api/profiles/sample_precision', method: 'GET', body: null },
      { url: '/api/report-templates', method: 'GET', body: null },
      { url: '/api/report-templates/tpl_a', method: 'GET', body: null },
      { url: '/api/project/recent', method: 'GET', body: null },
      { url: '/api/diagnostics', method: 'GET', body: null },
      { url: '/api/cache/stats', method: 'GET', body: null },
      { url: '/api/project/save', method: 'POST', body: { projectData: { name: 'proj_a' } } },
      { url: '/api/project/open', method: 'POST', body: { filePath: '/tmp/proj_a.fcstudio' } },
      { url: '/api/cache', method: 'DELETE', body: null },
    ]);
  });

  it('downloads zip when exportPack returns base64 payload', async () => {
    globalThis.fetch.mockResolvedValue(
      createJsonResponse({
        success: true,
        filename: 'bundle.zip',
        zipBase64: 'UEs=', // "PK"
      })
    );

    const createObjectURL = vi.fn(() => 'blob:mock-zip');
    const revokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;
    globalThis.atob = vi.fn(() => 'PK');

    const click = vi.fn();
    const realCreateElement = globalThis.document.createElement.bind(globalThis.document);
    globalThis.document.createElement = vi.fn((tagName, options) => {
      if (tagName !== 'a') {
        return realCreateElement(tagName, options);
      }
      const el = realCreateElement('a');
      el.click = click;
      return el;
    });

    const { result } = renderHook(() => useBackend());

    // Spy after renderHook so React can mount its container first
    const appendChildSpy = vi.spyOn(document.body, 'appendChild');
    const removeChildSpy = vi.spyOn(document.body, 'removeChild');

    let exported;
    await act(async () => {
      exported = await result.current.exportPack({ configPath: 'configs/examples/ks_flange.toml' });
    });

    expect(exported).toMatchObject({ success: true, filename: 'bundle.zip' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/export-pack',
      expect.objectContaining({ method: 'POST' })
    );
    expect(globalThis.document.createElement).toHaveBeenCalledWith('a');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(appendChildSpy).toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    expect(removeChildSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-zip');

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });
});

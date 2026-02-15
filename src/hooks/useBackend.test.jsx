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

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
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
});

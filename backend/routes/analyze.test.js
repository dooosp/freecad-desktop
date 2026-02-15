// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createAnalyzeHandler } from './handlers/analyze-handler.js';
import { createMockReq } from './handler-test-helpers.js';

function createMockSseRes() {
  return {
    statusCode: 200,
    jsonBody: null,
    headers: null,
    chunks: [],
    ended: false,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
      return this;
    },
    write(chunk) {
      this.chunks.push(chunk);
      return true;
    },
    end() {
      this.ended = true;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
  };
}

function parseSseEvents(chunks) {
  const raw = chunks.join('');
  return raw
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event: '));
      const dataLine = lines.find((line) => line.startsWith('data: '));
      return {
        event: eventLine ? eventLine.slice(7) : null,
        data: dataLine ? JSON.parse(dataLine.slice(6)) : null,
      };
    });
}

function makeCacheClass() {
  const ctor = vi.fn();
  const getCacheKey = vi.fn((stage) => `${stage}-key`);
  const checkCache = vi.fn(async () => ({ hit: false }));
  const storeCache = vi.fn(async () => undefined);

  class Cache {
    constructor(root) {
      ctor(root);
    }

    getCacheKey(...args) {
      return getCacheKey(...args);
    }

    checkCache(...args) {
      return checkCache(...args);
    }

    storeCache(...args) {
      return storeCache(...args);
    }
  }

  return { Cache, ctor, getCacheKey, checkCache, storeCache };
}

describe('analyze route handler', () => {
  it('returns 400 json when configPath is missing', async () => {
    const handler = createAnalyzeHandler();
    const req = createMockReq({
      body: {},
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig: vi.fn(),
        runScript: vi.fn(),
      },
    });
    const res = createMockSseRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'configPath required' });
    expect(res.chunks).toHaveLength(0);
  });

  it('emits create stage error and completes stream when model creation fails', async () => {
    const { Cache } = makeCacheClass();
    const handler = createAnalyzeHandler({
      AnalysisCacheClass: Cache,
      loadShopProfileFn: vi.fn(async () => null),
    });

    const loadConfig = vi.fn(async () => ({
      name: 'broken',
      shapes: [{ type: 'box' }],
    }));
    const runScript = vi.fn(async (script) => {
      if (script === 'create_model.py') throw new Error('create failed');
      return {};
    });

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        options: {},
      },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig,
        runScript,
      },
    });
    const res = createMockSseRes();

    await handler(req, res);

    const events = parseSseEvents(res.chunks);
    expect(events[0]).toMatchObject({
      event: 'stage',
      data: { stage: 'create', status: 'start' },
    });
    expect(events[1]).toMatchObject({
      event: 'stage',
      data: { stage: 'create', status: 'error', error: 'create failed' },
    });
    expect(events[2].event).toBe('complete');
    expect(events[2].data.errors[0]).toEqual({ stage: 'create', error: 'create failed' });
    expect(res.ended).toBe(true);
  });

  it('runs create/drawing/dfm/cost and emits complete payload', async () => {
    const { Cache, checkCache, storeCache } = makeCacheClass();
    const loadShopProfileFn = vi.fn(async () => ({ machine_limits: { max_dia: 100 } }));
    const postprocessSvgFn = vi.fn(async () => undefined);
    const toWSLPathFn = vi.fn(async () => '/tmp/output/a.svg');
    const readFileFn = vi.fn(async () => '<svg />');
    const runQaScorerFn = vi.fn(async () => ({ score: 91 }));

    const handler = createAnalyzeHandler({
      AnalysisCacheClass: Cache,
      loadShopProfileFn,
      postprocessSvgFn,
      toWSLPathFn,
      readFileFn,
      runQaScorerFn,
    });

    const loadConfig = vi.fn(async () => ({
      name: 'ok_part',
      shapes: [{ type: 'cylinder' }],
      drawing_plan: { style: { stroke_profile: 'custom' } },
      manufacturing: { material: 'AL6061' },
    }));
    const runScript = vi.fn(async (script, input) => {
      if (script === 'create_model.py') return { model_path: 'output/ok_part.step' };
      if (script === 'generate_drawing.py') {
        return {
          drawing_paths: [{ format: 'svg', path: 'output/a.svg' }, { format: 'dxf', path: 'output/a.dxf' }],
        };
      }
      if (script === 'dfm_checker.py') return { score: 88, summary: 'ok' };
      if (script === 'cost_estimator.py') return { unit_cost: 12345 };
      throw new Error(`unexpected script: ${script}`);
    });

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        profileName: 'sample_precision',
        options: {
          dxfExport: true,
          process: 'machining',
          batch: 5,
          weightsPreset: 'auto',
        },
      },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig,
        runScript,
      },
    });
    const res = createMockSseRes();

    await handler(req, res);

    expect(checkCache).toHaveBeenCalled();
    expect(storeCache).toHaveBeenCalled();
    expect(loadShopProfileFn).toHaveBeenCalledWith('/tmp/freecad-root', 'sample_precision');
    expect(postprocessSvgFn).toHaveBeenCalledWith('/tmp/freecad-root', 'output/a.svg', { profile: 'custom' });
    expect(toWSLPathFn).toHaveBeenCalledWith('/tmp/freecad-root', 'output/a.svg');
    expect(runQaScorerFn).toHaveBeenCalledWith('/tmp/freecad-root', 'output/a.svg', { weightsPreset: 'auto' });

    const events = parseSseEvents(res.chunks);
    const complete = events.find((event) => event.event === 'complete')?.data;
    expect(complete).toBeTruthy();
    expect(complete.stages).toEqual(['create', 'drawing', 'dfm', 'cost']);
    expect(complete.errors).toEqual([]);
    expect(complete.drawingSvg).toBe('<svg />');
    expect(complete.qa).toEqual({ score: 91 });
    expect(complete.dfm.score).toBe(88);
    expect(complete.cost.unit_cost).toBe(12345);

    const drawCall = runScript.mock.calls.find(([script]) => script === 'generate_drawing.py');
    expect(drawCall?.[1]?.drawing?.dxf).toBe(true);

    const dfmCall = runScript.mock.calls.find(([script]) => script === 'dfm_checker.py');
    expect(dfmCall?.[1]?.shop_profile).toEqual({ machine_limits: { max_dia: 100 } });

    const costCall = runScript.mock.calls.find(([script]) => script === 'cost_estimator.py');
    expect(costCall?.[1]).toMatchObject({
      batch_size: 5,
      process: 'machining',
      dfm_result: { score: 88, summary: 'ok' },
      shop_profile: { machine_limits: { max_dia: 100 } },
    });
    expect(res.ended).toBe(true);
  });

  it('continues to dfm/cost when drawing stage fails', async () => {
    const { Cache } = makeCacheClass();
    const handler = createAnalyzeHandler({
      AnalysisCacheClass: Cache,
      loadShopProfileFn: vi.fn(async () => null),
    });

    const loadConfig = vi.fn(async () => ({
      name: 'draw_fail_case',
      shapes: [{ type: 'box' }],
    }));
    const runScript = vi.fn(async (script) => {
      if (script === 'create_model.py') return { ok: true };
      if (script === 'generate_drawing.py') throw new Error('drawing failed');
      if (script === 'dfm_checker.py') return { score: 70 };
      if (script === 'cost_estimator.py') return { unit_cost: 77 };
      throw new Error(`unexpected script: ${script}`);
    });

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        options: {},
      },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig,
        runScript,
      },
    });
    const res = createMockSseRes();

    await handler(req, res);

    const events = parseSseEvents(res.chunks);
    const drawingError = events.find(
      (event) => event.event === 'stage' && event.data?.stage === 'drawing' && event.data?.status === 'error'
    );
    expect(drawingError?.data?.error).toBe('drawing failed');

    const complete = events.find((event) => event.event === 'complete')?.data;
    expect(complete.errors).toEqual([{ stage: 'drawing', error: 'drawing failed' }]);
    expect(complete.stages).toEqual(['create', 'dfm', 'cost']);
    expect(complete.dfm).toEqual({ score: 70 });
    expect(complete.cost).toEqual({ unit_cost: 77 });
    expect(res.ended).toBe(true);
  });

  it('handles step-direct windows path and reports drawing unsupported error', async () => {
    const { Cache } = makeCacheClass();
    const toWSLPathFn = vi.fn(async () => '/mnt/c/tmp/imported.step');
    const copyFileFn = vi.fn(async () => {
      throw new Error('copy failed');
    });

    const handler = createAnalyzeHandler({
      AnalysisCacheClass: Cache,
      loadShopProfileFn: vi.fn(async () => null),
      toWSLPathFn,
      copyFileFn,
      mkdirFn: vi.fn(async () => undefined),
    });

    const loadConfig = vi.fn(async () => ({
      import: {
        source_step: 'C:\\tmp\\imported.step',
        name: 'imported_win',
      },
    }));
    const runScript = vi.fn(async (script) => {
      if (script === 'inspect_model.py') return { model: { volume: 1.2 } };
      if (script === 'dfm_checker.py') return { score: 80 };
      if (script === 'cost_estimator.py') return { unit_cost: 100 };
      throw new Error(`unexpected script: ${script}`);
    });

    const req = createMockReq({
      body: {
        configPath: 'configs/imports/imported.toml',
        options: {},
      },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig,
        runScript,
      },
    });
    const res = createMockSseRes();

    await handler(req, res);

    expect(toWSLPathFn).toHaveBeenCalledWith('/tmp/freecad-root', 'C:\\tmp\\imported.step');
    expect(copyFileFn).toHaveBeenCalledWith(
      '/mnt/c/tmp/imported.step',
      '/tmp/freecad-root/output/imported_win.step'
    );

    const events = parseSseEvents(res.chunks);
    const createDone = events.find(
      (event) => event.event === 'stage' && event.data?.stage === 'create' && event.data?.status === 'done'
    );
    expect(createDone?.data?.stepDirect).toBe(true);

    const drawingError = events.find(
      (event) => event.event === 'stage' && event.data?.stage === 'drawing' && event.data?.status === 'error'
    );
    expect(drawingError?.data?.error).toMatch(/not available for STEP template-only configs/i);

    const complete = events.find((event) => event.event === 'complete')?.data;
    expect(complete.stages).toEqual(['create', 'dfm', 'cost']);
    expect(complete.errors).toEqual([
      {
        stage: 'drawing',
        error: 'Drawing generation is not available for STEP template-only configs. Add [[shapes]] or [[parts]] before generating drawing.',
      },
    ]);
  });

  it('uses cached entries for all stages without invoking scripts', async () => {
    const { Cache, checkCache, storeCache } = makeCacheClass();
    checkCache
      .mockResolvedValueOnce({ hit: true, entry: { result: { model_path: 'output/cached.step' } } })
      .mockResolvedValueOnce({
        hit: true,
        entry: { result: { drawing: { drawing_paths: [{ format: 'svg', path: 'output/cached.svg' }] }, drawingSvg: '<svg cached />', qa: { score: 99 } } },
      })
      .mockResolvedValueOnce({ hit: true, entry: { result: { score: 95 } } })
      .mockResolvedValueOnce({ hit: true, entry: { result: { status: 'tol-cached' } } })
      .mockResolvedValueOnce({ hit: true, entry: { result: { unit_cost: 777 } } });

    const handler = createAnalyzeHandler({
      AnalysisCacheClass: Cache,
      loadShopProfileFn: vi.fn(async () => ({ cap: true })),
    });

    const loadConfig = vi.fn(async () => ({
      name: 'cached_part',
      shapes: [{ type: 'cylinder' }],
      assembly: { method: 'stack' },
      parts: [{ id: 'A' }, { id: 'B' }],
    }));
    const runScript = vi.fn(async () => {
      throw new Error('runScript should not be called on cache hit');
    });

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        options: {},
      },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig,
        runScript,
      },
    });
    const res = createMockSseRes();

    await handler(req, res);

    expect(runScript).not.toHaveBeenCalled();
    expect(storeCache).not.toHaveBeenCalled();
    expect(checkCache).toHaveBeenCalledTimes(5);

    const complete = parseSseEvents(res.chunks).find((event) => event.event === 'complete')?.data;
    expect(complete.stages).toEqual(['create', 'drawing', 'dfm', 'tolerance', 'cost']);
    expect(complete.model).toEqual({ model_path: 'output/cached.step' });
    expect(complete.drawingSvg).toBe('<svg cached />');
    expect(complete.qa).toEqual({ score: 99 });
    expect(complete.dfm).toEqual({ score: 95 });
    expect(complete.tolerance).toEqual({ status: 'tol-cached' });
    expect(complete.cost).toEqual({ unit_cost: 777 });
  });

  it('runs tolerance stage with monte-carlo overrides', async () => {
    const { Cache } = makeCacheClass();
    const handler = createAnalyzeHandler({
      AnalysisCacheClass: Cache,
      loadShopProfileFn: vi.fn(async () => null),
    });

    const loadConfig = vi.fn(async () => ({
      name: 'tol_case',
      shapes: [{ type: 'box' }],
      assembly: { method: 'stack' },
      parts: [{ id: 'P1' }, { id: 'P2' }],
      tolerance: { default_grade: 'IT7' },
    }));
    const runScript = vi.fn(async (script, payload) => {
      if (script === 'create_model.py') return { ok: true };
      if (script === 'tolerance_analysis.py') {
        expect(payload.tolerance).toEqual({
          default_grade: 'IT7',
          monte_carlo: false,
          mc_samples: 2048,
        });
        return { pass: true };
      }
      throw new Error(`unexpected script: ${script}`);
    });

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        options: {
          drawing: false,
          dfm: false,
          cost: false,
          monteCarlo: false,
          mcSamples: 2048.9,
        },
      },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig,
        runScript,
      },
    });
    const res = createMockSseRes();

    await handler(req, res);

    const complete = parseSseEvents(res.chunks).find((event) => event.event === 'complete')?.data;
    expect(complete.stages).toEqual(['create', 'tolerance']);
    expect(complete.tolerance).toEqual({ pass: true });
  });

  it('emits error event when configuration load fails before stages', async () => {
    const { Cache } = makeCacheClass();
    const handler = createAnalyzeHandler({
      AnalysisCacheClass: Cache,
      loadShopProfileFn: vi.fn(async () => null),
    });

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/missing.toml',
        options: {},
      },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig: vi.fn(async () => {
          throw new Error('load failed');
        }),
        runScript: vi.fn(),
      },
    });
    const res = createMockSseRes();

    await handler(req, res);

    const events = parseSseEvents(res.chunks);
    expect(events).toEqual([
      {
        event: 'error',
        data: { error: 'load failed' },
      },
    ]);
    expect(res.ended).toBe(true);
  });
});

// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDrawingHandler } from './handlers/drawing-handler.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

describe('drawing route handler', () => {
  it('throws 400 when configPath is missing', async () => {
    const handler = createDrawingHandler({
      postprocessSvgFn: vi.fn(),
      readFileFn: vi.fn(),
      runQaScorerFn: vi.fn(),
      toWSLPathFn: vi.fn(),
    });
    const req = createMockReq({
      body: {},
      appLocals: {
        freecadRoot: '/tmp/noop',
        loadConfig: vi.fn(),
        deepMerge: vi.fn(),
        runScript: vi.fn(),
      },
    });
    const res = createMockRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'configPath required',
    });
  });

  it('throws 400 for step template-only config', async () => {
    const loadConfig = vi.fn(async () => ({
      import: { source_step: '/tmp/input.step' },
    }));
    const handler = createDrawingHandler({
      postprocessSvgFn: vi.fn(),
      readFileFn: vi.fn(),
      runQaScorerFn: vi.fn(),
      toWSLPathFn: vi.fn(),
    });

    const req = createMockReq({
      body: { configPath: 'configs/examples/template.toml' },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig,
        deepMerge: vi.fn((a) => a),
        runScript: vi.fn(),
      },
    });
    const res = createMockRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'Drawing generation is not available for STEP template-only configs. Add [[shapes]] or [[parts]] before generating drawing.',
    });
  });

  it('merges preset and enriches drawing result with svg and qa', async () => {
    const loadConfig = vi
      .fn()
      .mockImplementationOnce(async () => ({
        name: 'draw_case',
        shapes: [{ type: 'cylinder' }],
        drawing_plan: { style: { stroke_profile: 'custom' } },
      }))
      .mockImplementationOnce(async () => ({
        drawing: { title: 'Preset Draw' },
      }));
    const deepMerge = vi.fn((base, preset) => ({
      ...base,
      ...preset,
      drawing: { ...(base.drawing || {}), ...(preset.drawing || {}) },
    }));
    const runScript = vi.fn(async () => ({
      drawing_paths: [{ format: 'svg', path: 'output/part_drawing.svg' }],
      ok: true,
    }));

    const postprocessSvgFn = vi.fn(async () => undefined);
    const toWSLPathFn = vi.fn(async () => '/tmp/output/part_drawing.svg');
    const readFileFn = vi.fn(async () => '<svg />');
    const runQaScorerFn = vi.fn(async () => ({ score: 95 }));

    const handler = createDrawingHandler({
      postprocessSvgFn,
      toWSLPathFn,
      readFileFn,
      runQaScorerFn,
    });
    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        preset: 'ks_standard',
        weightsPreset: 'auto',
        standard: 'ASME',
        dxfExport: true,
      },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig,
        deepMerge,
        runScript,
      },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(loadConfig).toHaveBeenNthCalledWith(1, '/tmp/freecad-root/configs/examples/ks_flange.toml');
    expect(loadConfig).toHaveBeenNthCalledWith(
      2,
      '/tmp/freecad-root/configs/overrides/presets/ks_standard.toml'
    );
    expect(deepMerge).toHaveBeenCalledTimes(1);
    expect(runScript).toHaveBeenCalledWith(
      'generate_drawing.py',
      expect.objectContaining({
        name: 'draw_case',
        standard: 'ASME',
        drawing: expect.objectContaining({
          title: 'Preset Draw',
          dxf: true,
        }),
      }),
      { timeout: 120_000 }
    );
    expect(postprocessSvgFn).toHaveBeenCalledWith('/tmp/freecad-root', 'output/part_drawing.svg', {
      profile: 'custom',
    });
    expect(toWSLPathFn).toHaveBeenCalledWith('/tmp/freecad-root', 'output/part_drawing.svg');
    expect(readFileFn).toHaveBeenCalledWith('/tmp/output/part_drawing.svg', 'utf8');
    expect(runQaScorerFn).toHaveBeenCalledWith('/tmp/freecad-root', 'output/part_drawing.svg', {
      weightsPreset: 'auto',
    });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.svgContent).toBe('<svg />');
    expect(res.jsonBody.qa).toEqual({ score: 95 });
  });

  it('continues when optional svg post-processing steps fail', async () => {
    const loadConfig = vi.fn(async () => ({
      name: 'draw_case',
      shapes: [{ type: 'box' }],
      drawing: {},
    }));
    const runScript = vi.fn(async () => ({
      svg_path: 'output/failcase.svg',
      ok: true,
    }));

    const handler = createDrawingHandler({
      postprocessSvgFn: vi.fn(async () => {
        throw new Error('postprocess failed');
      }),
      toWSLPathFn: vi.fn(async () => {
        throw new Error('path convert failed');
      }),
      readFileFn: vi.fn(async () => '<svg />'),
      runQaScorerFn: vi.fn(async () => {
        throw new Error('qa failed');
      }),
    });

    const req = createMockReq({
      body: { configPath: 'configs/examples/ks_flange.toml' },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig,
        deepMerge: vi.fn((a) => a),
        runScript,
      },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({
      svg_path: 'output/failcase.svg',
      ok: true,
    });
    expect(res.jsonBody.svgContent).toBeUndefined();
    expect(res.jsonBody.qa).toBeUndefined();
  });
});

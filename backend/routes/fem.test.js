// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createFemHandler } from './handlers/fem-handler.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

describe('fem route handler', () => {
  it('throws 400 when configPath is missing', async () => {
    const handler = createFemHandler();
    const req = createMockReq({
      body: { fem: { analysisType: 'static' } },
      appLocals: { freecadRoot: '/tmp/noop', loadConfig: vi.fn(), runScript: vi.fn() },
    });
    const res = createMockRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'configPath required',
    });
  });

  it('throws 400 when fem config is missing', async () => {
    const handler = createFemHandler();
    const req = createMockReq({
      body: { configPath: 'configs/test.toml' },
      appLocals: { freecadRoot: '/tmp/noop', loadConfig: vi.fn(), runScript: vi.fn() },
    });
    const res = createMockRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'fem config required',
    });
  });

  it('merges fem config into loaded TOML and calls fem_analysis.py with snake_case keys', async () => {
    const handler = createFemHandler();
    const loadConfig = vi.fn(async () => ({ name: 'bracket', parts: [] }));
    const runScript = vi.fn(async () => ({
      max_displacement: 0.023,
      max_stress: 145.2,
      safety_factor: 1.72,
    }));

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_bracket.toml',
        fem: {
          analysisType: 'static',
          material: 'steel',
          meshMaxSize: 5.0,
          meshMinSize: 1.0,
          constraints: [
            { type: 'fixed', faces: ['Face1'] },
            { type: 'force', faces: ['Face2'], valueX: 0, valueY: 0, valueZ: -1000 },
          ],
        },
      },
      appLocals: { freecadRoot: '/tmp/fc-root', loadConfig, runScript },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(loadConfig).toHaveBeenCalledWith('/tmp/fc-root/configs/examples/ks_bracket.toml');
    expect(runScript).toHaveBeenCalledWith(
      'fem_analysis.py',
      expect.objectContaining({
        name: 'bracket',
        parts: [],
        fem: {
          analysis_type: 'static',
          material: 'steel',
          mesh_max_size: 5.0,
          mesh_min_size: 1.0,
          constraints: [
            { type: 'fixed', faces: ['Face1'] },
            { type: 'force', faces: ['Face2'], value_x: 0, value_y: 0, value_z: -1000 },
          ],
        },
      }),
      { timeout: 300_000 },
    );
    expect(res.jsonBody).toEqual({
      max_displacement: 0.023,
      max_stress: 145.2,
      safety_factor: 1.72,
    });
  });
});

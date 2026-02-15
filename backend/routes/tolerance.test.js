// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runToleranceHandler } from './handlers/tolerance-handler.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

describe('tolerance route handler', () => {
  it('throws 400 when configPath is missing', async () => {
    const req = createMockReq({
      body: {},
      appLocals: {
        freecadRoot: '/tmp/noop',
        loadConfig: vi.fn(),
        runScript: vi.fn(),
      },
    });
    const res = createMockRes();

    await expect(runToleranceHandler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'configPath required',
    });
  });

  it('throws 400 when assembly or parts are missing', async () => {
    const req = createMockReq({
      body: { configPath: 'configs/examples/ks_flange.toml' },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig: vi.fn(async () => ({ parts: [] })),
        runScript: vi.fn(),
      },
    });
    const res = createMockRes();

    await expect(runToleranceHandler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'Tolerance analysis requires an assembly config with [assembly] and [[parts]] sections.',
    });
  });

  it('runs tolerance_analysis.py with monte-carlo options', async () => {
    const loadConfig = vi.fn(async () => ({
      name: 'tol_case',
      assembly: { method: 'stack' },
      parts: [{ id: 'A' }, { id: 'B' }],
      tolerance: { default_grade: 'IT7' },
    }));
    const runScript = vi.fn(async () => ({ status: 'ok' }));
    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        standard: 'KS',
        monteCarlo: false,
        mcSamples: 1234.9,
      },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig,
        runScript,
      },
    });
    const res = createMockRes();

    await runToleranceHandler(req, res);

    expect(loadConfig).toHaveBeenCalledWith('/tmp/freecad-root/configs/examples/ks_flange.toml');
    expect(runScript).toHaveBeenCalledWith(
      'tolerance_analysis.py',
      expect.objectContaining({
        name: 'tol_case',
        standard: 'KS',
        tolerance: {
          default_grade: 'IT7',
          monte_carlo: false,
          mc_samples: 1234,
        },
      }),
      { timeout: 60_000 }
    );
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ status: 'ok' });
  });
});

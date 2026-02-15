// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDfmHandler } from './handlers/dfm-handler.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

describe('dfm route handler', () => {
  it('throws 400 when configPath is missing', async () => {
    const handler = createDfmHandler({ loadShopProfileFn: vi.fn() });
    const req = createMockReq({
      body: {},
      appLocals: {
        freecadRoot: '/tmp/noop',
        loadConfig: vi.fn(),
        runScript: vi.fn(),
      },
    });
    const res = createMockRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'configPath required',
    });
  });

  it('runs dfm_checker.py with normalized manufacturing process and profile', async () => {
    const loadShopProfileFn = vi.fn(async () => ({ machine_limits: { max_dia: 200 } }));
    const handler = createDfmHandler({ loadShopProfileFn });

    const loadConfig = vi.fn(async () => ({
      name: 'dfm_case',
    }));
    const runScript = vi.fn(async () => ({ score: 92 }));
    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        process: 'casting',
        standard: 'ASME',
        profileName: 'sample_precision',
      },
      appLocals: {
        freecadRoot: '/tmp/freecad-root',
        loadConfig,
        runScript,
      },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(loadConfig).toHaveBeenCalledWith('/tmp/freecad-root/configs/examples/ks_flange.toml');
    expect(loadShopProfileFn).toHaveBeenCalledWith('/tmp/freecad-root', 'sample_precision');
    expect(runScript).toHaveBeenCalledWith(
      'dfm_checker.py',
      expect.objectContaining({
        name: 'dfm_case',
        standard: 'ASME',
        manufacturing: { process: 'casting' },
        shop_profile: { machine_limits: { max_dia: 200 } },
      }),
      { timeout: 60_000 }
    );
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ score: 92 });
  });
});

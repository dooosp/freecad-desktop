// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createCostHandler } from './handlers/cost-handler.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

describe('cost route handler', () => {
  it('throws 400 when configPath is missing', async () => {
    const handler = createCostHandler({ loadShopProfileFn: vi.fn() });
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

  it('passes normalized input to cost_estimator.py with defaults and shop profile', async () => {
    const loadShopProfileFn = vi.fn(async () => ({ rates: { machining: 1.2 } }));
    const handler = createCostHandler({ loadShopProfileFn });

    const loadConfig = vi.fn(async () => ({
      name: 'test_part',
      manufacturing: { process: 'casting', material: 'AL6061' },
    }));
    const runScript = vi.fn(async () => ({ unit_cost: 12345 }));

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        process: 'machining',
        material: 'SS304',
        batchSize: 7,
        dfmResult: { score: 87 },
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
      'cost_estimator.py',
      expect.objectContaining({
        name: 'test_part',
        material: 'SS304',
        process: 'machining',
        batch_size: 7,
        dfm_result: { score: 87 },
        standard: 'KS',
        shop_profile: { rates: { machining: 1.2 } },
      }),
      { timeout: 60_000 }
    );
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ unit_cost: 12345 });
  });
});

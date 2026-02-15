// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareProfilesHandler } from './handlers/profile-compare.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

const tempRoots = [];

afterEach(async () => {
  await Promise.allSettled(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('profile compare route handler', () => {
  it('throws 400 when compare payload is missing required fields', async () => {
    const req = createMockReq({
      body: { profileA: '_default', profileB: 'sample_precision' },
      appLocals: {
        freecadRoot: '/tmp/noop',
        loadConfig: vi.fn(),
        runScript: vi.fn(),
      },
    });
    const res = createMockRes();

    await expect(compareProfilesHandler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'configPath required',
    });
  });

  it('compares default and custom profile using dfm/cost scripts', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'profile-route-test-'));
    tempRoots.push(freecadRoot);

    await mkdir(join(freecadRoot, 'configs', 'profiles'), { recursive: true });
    await writeFile(
      join(freecadRoot, 'configs', 'profiles', 'sample_precision.json'),
      JSON.stringify({
        label: 'Sample Precision',
        process_capabilities: { machining: { available: true } },
      }),
      'utf8'
    );

    const loadConfig = vi.fn(async () => ({
      name: 'test_part',
      manufacturing: { process: 'casting', material: 'AL6061' },
    }));

    const runScript = vi.fn(async (script, input) => {
      if (script === 'dfm_checker.py') return { score: input.shop_profile ? 90 : 10 };
      if (script === 'cost_estimator.py') return { unit_cost: input.shop_profile ? 200 : 100 };
      throw new Error(`unexpected script: ${script}`);
    });

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        profileA: '_default',
        profileB: 'sample_precision',
        options: { process: 'machining', material: 'SS304', batch: 5 },
      },
      appLocals: { freecadRoot, loadConfig, runScript },
    });
    const res = createMockRes();

    await compareProfilesHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.profileA.name).toBe('_default');
    expect(res.jsonBody.profileB.name).toBe('sample_precision');
    expect(res.jsonBody.profileA.dfm.score).toBe(10);
    expect(res.jsonBody.profileB.dfm.score).toBe(90);

    const dfmCalls = runScript.mock.calls.filter(([script]) => script === 'dfm_checker.py');
    const costCalls = runScript.mock.calls.filter(([script]) => script === 'cost_estimator.py');

    expect(dfmCalls).toHaveLength(2);
    expect(costCalls).toHaveLength(2);
    expect(dfmCalls.some(([, input]) => !input.shop_profile)).toBe(true);
    expect(dfmCalls.some(([, input]) => Boolean(input.shop_profile))).toBe(true);
    expect(costCalls.every(([, input]) => input.batch_size === 5)).toBe(true);
    expect(costCalls.every(([, input]) => input.material === 'SS304')).toBe(true);
  });
});

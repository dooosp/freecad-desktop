// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareCosts, estimateCost } from './cost-estimator.js';

const tempRoots = [];

async function createFreecadRoot(runnerSource) {
  const root = await mkdtemp(join(tmpdir(), 'cost-estimator-test-'));
  tempRoots.push(root);
  await mkdir(join(root, 'lib'), { recursive: true });
  await writeFile(join(root, 'lib', 'runner.js'), runnerSource, 'utf8');
  return root;
}

afterEach(async () => {
  await Promise.allSettled(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('estimateCost', () => {
  it('builds script input from config defaults', async () => {
    const freecadRoot = await createFreecadRoot(`
      export async function runScript(script, input, opts) {
        return { script, input, opts };
      }
    `);

    const result = await estimateCost(freecadRoot, {
      name: 'part_a',
      manufacturing: { material: 'SS316', process: 'casting' },
    });

    expect(result.script).toBe('cost_estimator.py');
    expect(result.input).toMatchObject({
      name: 'part_a',
      material: 'SS316',
      process: 'casting',
      batch_size: 1,
      dfm_result: null,
    });
    expect(result.opts).toEqual({ timeout: 60_000 });
  });

  it('applies option overrides for material/process/batch/dfm result', async () => {
    const freecadRoot = await createFreecadRoot(`
      export async function runScript(script, input, opts) {
        return { script, input, opts };
      }
    `);

    const result = await estimateCost(
      freecadRoot,
      { manufacturing: { material: 'AL6061', process: 'machining' } },
      {
        material: 'A36',
        process: 'sheet_metal',
        batchSize: 25,
        dfmResult: { score: 82 },
      },
    );

    expect(result.input).toMatchObject({
      material: 'A36',
      process: 'sheet_metal',
      batch_size: 25,
      dfm_result: { score: 82 },
    });
  });
});

describe('compareCosts', () => {
  it('returns per-process results and captures thrown errors', async () => {
    const freecadRoot = await createFreecadRoot(`
      export async function runScript(script, input) {
        if (input.process === 'casting') {
          throw new Error('unsupported process');
        }
        return { unit_cost: input.process.length, script };
      }
    `);

    const results = await compareCosts(
      freecadRoot,
      { name: 'part_b' },
      ['machining', 'casting', '3d_printing'],
    );

    expect(results).toEqual([
      { process: 'machining', unit_cost: 9, script: 'cost_estimator.py' },
      { process: 'casting', error: 'unsupported process' },
      { process: '3d_printing', unit_cost: 11, script: 'cost_estimator.py' },
    ]);
  });
});

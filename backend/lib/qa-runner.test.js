// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runQaScorer } from './qa-runner.js';

const tempRoots = [];
const envSnapshots = new Map();

function setEnv(name, value) {
  if (!envSnapshots.has(name)) {
    envSnapshots.set(name, process.env[name]);
  }
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function createFreecadRoot() {
  const root = await mkdtemp(join(tmpdir(), 'qa-runner-test-'));
  tempRoots.push(root);
  await mkdir(join(root, 'lib'), { recursive: true });
  await mkdir(join(root, 'scripts'), { recursive: true });

  await writeFile(
    join(root, 'lib', 'paths.js'),
    `
      export const PYTHON_EXE_WSL = process.execPath;
      export function toWindows(path) { return String(path).replace(/\\.py$/i, '.mjs'); }
      export function toWSL(path) {
        return '/wsl/' + String(path).replace(':', '').replaceAll('\\\\', '/');
      }
    `,
    'utf8',
  );

  await writeFile(
    join(root, 'scripts', 'qa_scorer.mjs'),
    `
      import { writeFileSync, writeSync } from 'node:fs';
      const args = process.argv.slice(2);
      if (process.env.QA_ARGS_OUT) {
        writeFileSync(process.env.QA_ARGS_OUT, JSON.stringify(args), 'utf8');
      }
      const presetIdx = args.indexOf('--weights-preset');
      const preset = presetIdx >= 0 ? args[presetIdx + 1] : 'default';
      if (preset === 'fail') {
        writeSync(2, 'forced qa error\\n');
        process.exitCode = 2;
      } else if (preset === 'noscore') {
        writeSync(1, 'finished without score line\\n');
      } else {
        writeSync(1, 'QA Score: 87/100\\n');
        writeSync(1, 'weight_profile: ' + preset + '\\n');
      }
    `,
    'utf8',
  );

  return root;
}

afterEach(async () => {
  await Promise.allSettled(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
  for (const [name, value] of envSnapshots.entries()) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  envSnapshots.clear();
});

describe('runQaScorer', () => {
  it('throws when svgPath is missing', async () => {
    await expect(runQaScorer('/tmp/any', '')).rejects.toThrow('svgPath is required for qa_scorer');
  });

  it('runs scorer and returns parsed score/profile with converted args', async () => {
    const freecadRoot = await createFreecadRoot();
    const argsOut = join(freecadRoot, 'qa-args.json');
    setEnv('QA_ARGS_OUT', argsOut);

    const result = await runQaScorer(
      freecadRoot,
      'C:\\tmp\\sample_drawing.svg',
      {
        planPath: 'C:\\tmp\\qa_plan.toml',
        configPath: 'C:\\tmp\\cfg.toml',
        weightsPreset: 'auto',
      },
    );

    const args = JSON.parse(await readFile(argsOut, 'utf8'));
    expect(args[0]).toBe('/wsl/C/tmp/sample_drawing.svg');
    expect(args).toContain('--plan');
    expect(args).toContain('/wsl/C/tmp/qa_plan.toml');
    expect(args).toContain('--config');
    expect(args).toContain('/wsl/C/tmp/cfg.toml');
    expect(args).toContain('--weights-preset');
    expect(args).toContain('auto');

    expect(result).toEqual({
      score: 87,
      file: 'sample_drawing.svg',
      weightProfile: 'auto',
    });
  });

  it('propagates non-zero exit errors with stderr tail', async () => {
    const freecadRoot = await createFreecadRoot();

    await expect(
      runQaScorer(freecadRoot, '/tmp/bad.svg', { weightsPreset: 'fail' }),
    ).rejects.toThrow('qa_scorer exited 2: forced qa error');
  });

  it('throws when output does not contain QA score line', async () => {
    const freecadRoot = await createFreecadRoot();

    await expect(
      runQaScorer(freecadRoot, '/tmp/no_score.svg', { weightsPreset: 'noscore' }),
    ).rejects.toThrow('qa_scorer output did not include score');
  });
});

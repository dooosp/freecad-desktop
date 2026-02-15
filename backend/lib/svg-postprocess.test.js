// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { postprocessSvg } from './svg-postprocess.js';

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
  const root = await mkdtemp(join(tmpdir(), 'svg-postprocess-test-'));
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
    join(root, 'scripts', 'postprocess_svg.mjs'),
    `
      import { writeFileSync, writeSync } from 'node:fs';
      const args = process.argv.slice(2);
      if (process.env.POST_ARGS_OUT) {
        writeFileSync(process.env.POST_ARGS_OUT, JSON.stringify(args), 'utf8');
      }
      const profileIdx = args.indexOf('--profile');
      const profile = profileIdx >= 0 ? args[profileIdx + 1] : 'ks';
      if (profile === 'fail') {
        writeSync(2, 'invalid profile\\n');
        process.exitCode = 3;
      } else {
        writeSync(1, 'postprocess ok\\n');
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

describe('postprocessSvg', () => {
  it('throws when svgPath is missing', async () => {
    await expect(postprocessSvg('/tmp/any', null)).rejects.toThrow('svgPath is required for postprocess_svg');
  });

  it('builds default report path from svg name and returns trimmed output', async () => {
    const freecadRoot = await createFreecadRoot();
    const argsOut = join(freecadRoot, 'post-args.json');
    setEnv('POST_ARGS_OUT', argsOut);

    const result = await postprocessSvg(
      freecadRoot,
      'output\\part_drawing.svg',
      { profile: 'exam' },
    );

    const args = JSON.parse(await readFile(argsOut, 'utf8'));
    const svgResolved = resolve(process.cwd(), 'output/part_drawing.svg');
    const reportResolved = resolve(process.cwd(), 'output/part_drawing_repair_report.json');

    expect(args[0]).toBe(svgResolved);
    expect(args).toContain('-o');
    expect(args).toContain(svgResolved);
    expect(args).toContain('--report');
    expect(args).toContain(reportResolved);
    expect(args).toContain('--profile');
    expect(args).toContain('exam');

    expect(result).toEqual({
      output: 'postprocess ok',
      reportPath: reportResolved,
    });
  });

  it('uses converted Windows paths for plan/report options', async () => {
    const freecadRoot = await createFreecadRoot();
    const argsOut = join(freecadRoot, 'post-args-win.json');
    setEnv('POST_ARGS_OUT', argsOut);

    const result = await postprocessSvg(
      freecadRoot,
      'C:\\tmp\\sample.svg',
      {
        profile: 'ks',
        planPath: 'C:\\tmp\\plan.toml',
        reportPath: 'C:\\tmp\\repair.json',
      },
    );

    const args = JSON.parse(await readFile(argsOut, 'utf8'));
    expect(args[0]).toBe('/wsl/C/tmp/sample.svg');
    expect(args).toContain('--plan');
    expect(args).toContain('/wsl/C/tmp/plan.toml');
    expect(args).toContain('--report');
    expect(args).toContain('/wsl/C/tmp/repair.json');
    expect(result.reportPath).toBe('/wsl/C/tmp/repair.json');
  });

  it('propagates non-zero exit errors with stderr tail', async () => {
    const freecadRoot = await createFreecadRoot();

    await expect(
      postprocessSvg(freecadRoot, '/tmp/bad.svg', { profile: 'fail' }),
    ).rejects.toThrow('postprocess_svg exited 3: invalid profile');
  });
});

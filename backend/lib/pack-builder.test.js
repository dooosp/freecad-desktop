// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { toOutputPath, getExportPathByFormat } from './pack-builder.js';

describe('pack-builder path helpers', () => {
  it('prefers absolute existing path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pack-builder-test-'));
    const absFile = join(root, 'absolute.dxf');
    await writeFile(absFile, 'x', 'utf8');

    expect(toOutputPath(absFile, [])).toBe(absFile);

    await rm(root, { recursive: true, force: true });
  });

  it('resolves relative output path from cwd', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'pack-builder-cwd-'));
    await mkdir(join(cwd, 'output'), { recursive: true });
    const dxf = join(cwd, 'output', 'part_front.dxf');
    await writeFile(dxf, 'dxf', 'utf8');

    const resolved = toOutputPath('output\\part_front.dxf', [], cwd);
    expect(resolved).toBe(dxf);

    await rm(cwd, { recursive: true, force: true });
  });

  it('falls back to freecad root output path', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'pack-builder-cwd-'));
    const freecadRoot = await mkdtemp(join(tmpdir(), 'pack-builder-root-'));
    await mkdir(join(freecadRoot, 'output'), { recursive: true });
    const svg = join(freecadRoot, 'output', 'part_drawing.svg');
    await writeFile(svg, '<svg/>', 'utf8');

    const resolved = toOutputPath('output/part_drawing.svg', [freecadRoot], cwd);
    expect(resolved).toBe(svg);

    await rm(cwd, { recursive: true, force: true });
    await rm(freecadRoot, { recursive: true, force: true });
  });

  it('returns null when source file is missing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'pack-builder-cwd-'));
    const freecadRoot = await mkdtemp(join(tmpdir(), 'pack-builder-root-'));

    const resolved = toOutputPath('output/missing.dxf', [freecadRoot], cwd);
    expect(resolved).toBeNull();

    await rm(cwd, { recursive: true, force: true });
    await rm(freecadRoot, { recursive: true, force: true });
  });
});

describe('getExportPathByFormat', () => {
  it('reads from direct key, exports and drawing_paths in priority order', () => {
    expect(getExportPathByFormat({ dxf_path: 'output/direct.dxf' }, 'dxf')).toBe('output/direct.dxf');

    expect(getExportPathByFormat({
      exports: [{ format: 'dxf', path: 'output/from-exports.dxf' }],
    }, 'dxf')).toBe('output/from-exports.dxf');

    expect(getExportPathByFormat({
      drawing_paths: [{ format: 'dxf', path: 'output/from-drawing-paths.dxf' }],
    }, 'dxf')).toBe('output/from-drawing-paths.dxf');
  });
});

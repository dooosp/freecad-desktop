// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildPack } from './pack-builder.js';
import { toOutputPath, getExportPathByFormat } from './pack-paths.js';

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

  it('handles Windows absolute-style path via output basename fallback', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'pack-builder-cwd-'));
    const freecadRoot = await mkdtemp(join(tmpdir(), 'pack-builder-root-'));
    await mkdir(join(freecadRoot, 'output'), { recursive: true });
    const dxf = join(freecadRoot, 'output', 'win_front.dxf');
    await writeFile(dxf, 'dxf', 'utf8');

    const resolved = toOutputPath('C:\\Users\\taeho\\output\\win_front.dxf', [freecadRoot], cwd);
    expect(resolved).toBe(dxf);

    await rm(cwd, { recursive: true, force: true });
    await rm(freecadRoot, { recursive: true, force: true });
  });

  it('handles UNC-style path via output basename fallback', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'pack-builder-cwd-'));
    const freecadRoot = await mkdtemp(join(tmpdir(), 'pack-builder-root-'));
    await mkdir(join(freecadRoot, 'output'), { recursive: true });
    const svg = join(freecadRoot, 'output', 'unc_drawing.svg');
    await writeFile(svg, '<svg/>', 'utf8');

    const resolved = toOutputPath('\\\\server\\share\\output\\unc_drawing.svg', [freecadRoot], cwd);
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

describe('buildPack', () => {
  it('creates a zipped deliverable pack with selected artifacts', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'pack-builder-freecad-'));
    await mkdir(join(freecadRoot, 'output'), { recursive: true });
    await mkdir(join(freecadRoot, 'configs'), { recursive: true });

    await writeFile(join(freecadRoot, 'output', 'part.step'), 'step-data', 'utf8');
    await writeFile(join(freecadRoot, 'output', 'part_drawing.svg'), '<svg/>', 'utf8');
    await writeFile(join(freecadRoot, 'output', 'part_front.dxf'), '0\nEOF\n', 'utf8');
    await writeFile(join(freecadRoot, 'output', 'part_drawing.pdf'), '%PDF-1.7', 'utf8');
    await writeFile(join(freecadRoot, 'configs', 'part.toml'), 'name = "valve"', 'utf8');

    const result = await buildPack({
      freecadRoot,
      configPath: 'configs/part.toml',
      config: {
        name: 'valve',
        manufacturing: { material: 'SS304' },
        shapes: [{ id: 'body', type: 'cylinder', diameter: 20, length: 80 }],
      },
      results: {
        model: { step_path: 'output/part.step' },
        drawing: {
          drawing_paths: [
            { format: 'svg', path: 'output/part_drawing.svg' },
            { format: 'dxf', path: 'output/part_front.dxf' },
            { format: 'pdf', path: 'output/part_drawing.pdf' },
          ],
        },
        dfm: { score: 86 },
        tolerance: { fit: 'H7/g6' },
        cost: {
          total_cost: 100000,
          breakdown: { material_cost: 30000, machining_cost: 70000 },
        },
      },
      profileName: 'precision_shop',
      templateName: 'default_report',
      revision: 'Rev.B',
      organization: 'Acme',
      include: {
        step: true,
        svg: true,
        dxf: true,
        drawing_pdf: true,
        dfm: true,
        tolerance: true,
        cost: true,
        report: true,
        bom: true,
      },
      reportPdfBase64: Buffer.from('pdf-report-data').toString('base64'),
    });

    expect(result.filename).toMatch(/^valve_Rev\.B_\d{8}\.zip$/);
    expect(result.zipBase64.startsWith('UEsDB')).toBe(true);
    expect(result.zipBase64.length).toBeGreaterThan(100);

    await rm(freecadRoot, { recursive: true, force: true });
  });

  it('still builds when included source files are missing and uses default naming', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'pack-builder-freecad-'));
    await mkdir(join(freecadRoot, 'configs'), { recursive: true });
    await writeFile(join(freecadRoot, 'configs', 'minimal.toml'), 'name = "minimal"', 'utf8');

    const result = await buildPack({
      freecadRoot,
      configPath: 'configs/minimal.toml',
      config: {},
      results: {
        model: { step_path: 'output/missing.step' },
        drawing: {
          drawing_paths: [
            { format: 'svg', path: 'output/missing.svg' },
            { format: 'dxf', path: 'output/missing.dxf' },
            { format: 'pdf', path: 'output/missing.pdf' },
          ],
        },
      },
      include: {
        step: true,
        svg: true,
        dxf: true,
        drawing_pdf: true,
        bom: true,
      },
    });

    expect(result.filename).toMatch(/^part_Rev\.A_\d{8}\.zip$/);
    expect(result.zipBase64.startsWith('UEsDB')).toBe(true);

    await rm(freecadRoot, { recursive: true, force: true });
  });
});

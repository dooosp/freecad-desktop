// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateReportHandler } from './handlers/report-handler.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

const tempRoots = [];

afterEach(async () => {
  await Promise.allSettled(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('report route handler', () => {
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

    await expect(generateReportHandler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'configPath required',
    });
  });

  it('merges template overrides and calls engineering_report.py', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'report-route-test-'));
    tempRoots.push(freecadRoot);

    await mkdir(join(freecadRoot, 'configs', 'report-templates'), { recursive: true });
    await writeFile(
      join(freecadRoot, 'configs', 'report-templates', 'custom_template.json'),
      JSON.stringify({
        label: 'Custom Template',
        language: 'ko',
        sections: {
          drawing: { enabled: true, order: 1 },
          dfm: { enabled: true, order: 2 },
        },
        disclaimer: { enabled: true },
        signature: { enabled: true },
      }),
      'utf8'
    );

    const loadConfig = vi.fn(async () => ({
      name: 'test_part',
      standard: 'KS',
      export: { directory: 'output' },
    }));

    let capturedInput = null;
    const runScript = vi.fn(async (script, input) => {
      expect(script).toBe('engineering_report.py');
      capturedInput = input;
      return { pdf_path: 'output/mock_report.pdf' };
    });

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        templateName: 'custom_template',
        metadata: { part_name: 'Route Test Part' },
        sections: {
          drawing: false,
          cost: true,
        },
        options: {
          language: 'en',
          disclaimer: false,
          signature: false,
        },
        analysisResults: {
          drawing: {
            bom: [{ id: 'A-1', qty: 2 }],
          },
          dfm: { score: 88 },
          cost: { unit_cost: 1000 },
        },
      },
      appLocals: { freecadRoot, loadConfig, runScript },
    });
    const res = createMockRes();

    await generateReportHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.pdf_path).toBe('output/mock_report.pdf');

    expect(runScript).toHaveBeenCalledTimes(1);
    expect(capturedInput).toBeTruthy();
    expect(capturedInput._report_template.template.language).toBe('en');
    expect(capturedInput._report_template.template.sections.drawing.enabled).toBe(false);
    expect(capturedInput._report_template.template.sections.cost.enabled).toBe(true);
    expect(capturedInput._report_options.include_drawing).toBe(false);
    expect(capturedInput._report_options.include_cost).toBe(true);
    expect(capturedInput.bom).toEqual([{ id: 'A-1', qty: 2 }]);
  });

  it('maps tolerance pairs to fits and attaches pdf base64 when paths helper exists', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'report-route-test-'));
    tempRoots.push(freecadRoot);

    await mkdir(join(freecadRoot, 'lib'), { recursive: true });
    await mkdir(join(freecadRoot, 'output'), { recursive: true });
    await mkdir(join(freecadRoot, 'configs', 'profiles'), { recursive: true });
    await writeFile(
      join(freecadRoot, 'lib', 'paths.js'),
      'export const toWSL = (p) => p.startsWith(\"/\") ? p : `${process.cwd()}/${String(p).replaceAll(\"\\\\\\\\\", \"/\")}`;',
      'utf8',
    );
    await writeFile(join(freecadRoot, 'output', 'mapped_report.pdf'), 'pdf-bytes', 'utf8');
    await writeFile(
      join(freecadRoot, 'configs', 'profiles', 'sample_precision.json'),
      JSON.stringify({ machine_limits: { max_dia: 100 } }),
      'utf8'
    );

    const loadConfig = vi.fn(async () => ({
      name: 'tolerance_part',
      export: {},
      bom: [{ id: 'CFG-BOM' }],
    }));
    let capturedInput = null;
    const runScript = vi.fn(async (_script, input) => {
      capturedInput = input;
      return { pdf_path: join(freecadRoot, 'output', 'mapped_report.pdf') };
    });

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        profileName: 'sample_precision',
        includeDrawing: false,
        includeCost: false,
        analysisResults: {
          standard: 'ISO',
          tolerance: {
            pairs: [{
              bore_part: 'B1',
              shaft_part: 'S1',
              spec: 'H7/g6',
              fit_type: 'clearance',
              clearance_min: 0.01,
              clearance_max: 0.04,
            }],
          },
        },
      },
      appLocals: { freecadRoot, loadConfig, runScript },
    });
    const res = createMockRes();

    await generateReportHandler(req, res);

    expect(capturedInput.standard).toBe('ISO');
    expect(capturedInput.shop_profile).toEqual({ machine_limits: { max_dia: 100 } });
    expect(capturedInput._report_options.include_drawing).toBe(false);
    expect(capturedInput._report_options.include_cost).toBe(false);
    expect(capturedInput.tolerance_results.fits).toEqual([{
      bore: 'B1',
      shaft: 'S1',
      spec: 'H7/g6',
      fit_type: 'clearance',
      min_clearance: 0.01,
      max_clearance: 0.04,
    }]);
    expect(res.jsonBody.pdfBase64).toBe(Buffer.from('pdf-bytes').toString('base64'));
  });

  it('continues without template/pdf base64 when optional file reads fail', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'report-route-test-'));
    tempRoots.push(freecadRoot);

    const loadConfig = vi.fn(async () => ({
      name: 'fallback_part',
      standard: 'KS',
      export: { step: true },
    }));
    let capturedInput = null;
    const runScript = vi.fn(async (_script, input) => {
      capturedInput = input;
      return { path: 'output/missing_report.pdf' };
    });

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        templateName: 'missing_template',
        sections: { drawing: 'yes', custom: false },
        options: { standard: 'JIS' },
        analysisResults: {
          drawing: { bom: [{ id: 'B-1' }] },
          qa: { score: 95 },
          dfm: { score: 90 },
          cost: { unit_cost: 3210 },
        },
      },
      appLocals: { freecadRoot, loadConfig, runScript },
    });
    const res = createMockRes();

    await generateReportHandler(req, res);

    expect(capturedInput._report_template).toBeUndefined();
    expect(capturedInput._report_options).toEqual({
      include_drawing: true,
      include_dfm: true,
      include_tolerance: true,
      include_cost: true,
    });
    expect(capturedInput.bom).toEqual([{ id: 'B-1' }]);
    expect(res.jsonBody.pdfBase64).toBeUndefined();
  });
});

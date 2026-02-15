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
});

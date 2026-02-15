// @vitest-environment node
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStepImportHandler,
  saveStepConfigHandler,
} from './handlers/step-import-handler.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

const tempRoots = [];

afterEach(async () => {
  await Promise.allSettled(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('step import route handlers', () => {
  it('returns 400 when neither file upload nor filePath is provided', async () => {
    const handler = createStepImportHandler({
      analyzeStepFn: vi.fn(),
      generateConfigFromAnalysisFn: vi.fn(),
    });
    const req = createMockReq({
      body: {},
      appLocals: { freecadRoot: '/tmp/freecad-root' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/No STEP file provided/i);
  });

  it('imports from tauri filePath mode and writes generated config', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'step-import-handler-'));
    tempRoots.push(freecadRoot);
    await mkdir(join(freecadRoot, 'configs', 'imports'), { recursive: true });

    const analysis = {
      success: true,
      source_step: '/tmp/source.step',
      suggested_config: { name: 'imported_source' },
    };
    const analyzeStepFn = vi.fn(async () => analysis);
    const generateConfigFromAnalysisFn = vi.fn(() => 'name = "imported_source"\n');
    const handler = createStepImportHandler({ analyzeStepFn, generateConfigFromAnalysisFn });

    const req = createMockReq({
      body: { filePath: '/tmp/source.step' },
      appLocals: { freecadRoot },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(analyzeStepFn).toHaveBeenCalledWith(freecadRoot, '/tmp/source.step');
    expect(generateConfigFromAnalysisFn).toHaveBeenCalledWith(analysis);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.success).toBe(true);
    expect(res.jsonBody.configPath).toBe('configs/imports/source.toml');

    const written = await readFile(join(freecadRoot, 'configs', 'imports', 'source.toml'), 'utf8');
    expect(written).toContain('name = "imported_source"');
  });

  it('imports uploaded file in web mode and copies upload into output/imports', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'step-import-handler-'));
    tempRoots.push(freecadRoot);

    const uploadPath = join(freecadRoot, 'upload.step');
    await writeFile(uploadPath, 'STEPDATA', 'utf8');

    const analyzeStepFn = vi.fn(async () => ({
      success: true,
      source_step: 'unused',
      suggested_config: { name: 'imported_uploaded_part' },
    }));
    const generateConfigFromAnalysisFn = vi.fn(() => 'name = "imported_uploaded_part"\n');
    const handler = createStepImportHandler({ analyzeStepFn, generateConfigFromAnalysisFn });

    const req = createMockReq({
      body: {},
      appLocals: { freecadRoot },
    });
    req.file = {
      originalname: 'uploaded_part.step',
      path: uploadPath,
    };
    const res = createMockRes();

    await handler(req, res);

    const copiedStepPath = join(freecadRoot, 'output', 'imports', 'uploaded_part.step');
    expect(analyzeStepFn).toHaveBeenCalledWith(freecadRoot, copiedStepPath);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.stepFile).toBe(copiedStepPath);
    expect(res.jsonBody.configPath).toBe('configs/imports/uploaded_part.toml');
    const copiedData = await readFile(copiedStepPath, 'utf8');
    expect(copiedData).toBe('STEPDATA');
  });

  it('returns 500 when analyzeStep fails', async () => {
    const handler = createStepImportHandler({
      analyzeStepFn: vi.fn(async () => {
        throw new Error('analyze failed');
      }),
      generateConfigFromAnalysisFn: vi.fn(),
    });
    const req = createMockReq({
      body: { filePath: '/tmp/fail.step' },
      appLocals: { freecadRoot: '/tmp/freecad-root' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.error).toContain('analyze failed');
  });

  it('save-config validates inputs and writes file only inside freecadRoot', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'step-save-handler-'));
    tempRoots.push(freecadRoot);
    await mkdir(join(freecadRoot, 'configs', 'imports'), { recursive: true });

    const missingReq = createMockReq({
      body: { configPath: 'configs/imports/a.toml' },
      appLocals: { freecadRoot },
    });
    const missingRes = createMockRes();
    await saveStepConfigHandler(missingReq, missingRes);
    expect(missingRes.statusCode).toBe(400);

    const invalidReq = createMockReq({
      body: {
        configPath: '../../../etc/passwd',
        tomlString: 'name = "blocked"\n',
      },
      appLocals: { freecadRoot },
    });
    const invalidRes = createMockRes();
    await saveStepConfigHandler(invalidReq, invalidRes);
    expect(invalidRes.statusCode).toBe(403);

    const validRelPath = 'configs/imports/edited.toml';
    const validReq = createMockReq({
      body: {
        configPath: validRelPath,
        tomlString: 'name = "edited"\n',
      },
      appLocals: { freecadRoot },
    });
    const validRes = createMockRes();
    await saveStepConfigHandler(validReq, validRes);

    expect(validRes.statusCode).toBe(200);
    expect(validRes.jsonBody).toEqual({ success: true, configPath: validRelPath });

    const savedPath = resolve(freecadRoot, validRelPath);
    await access(savedPath);
    const savedToml = await readFile(savedPath, 'utf8');
    expect(savedToml).toContain('name = "edited"');
  });
});

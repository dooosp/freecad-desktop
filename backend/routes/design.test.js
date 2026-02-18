// @vitest-environment node
import { mkdtemp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createDesignHandler } from './handlers/design-handler.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

describe('design route handler', () => {
  it('throws 400 when mode is missing', async () => {
    const handler = createDesignHandler({
      designFromTextFn: vi.fn(),
      reviewTomlFn: vi.fn(),
      validateTomlFn: vi.fn(),
    });
    const req = createMockReq({
      body: {},
      appLocals: { freecadRoot: '/tmp/noop', runScript: vi.fn() },
    });
    const res = createMockRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'mode required (design|review|build)',
    });
  });

  it('throws 400 when description is missing for design mode', async () => {
    const handler = createDesignHandler({
      designFromTextFn: vi.fn(),
      reviewTomlFn: vi.fn(),
      validateTomlFn: vi.fn(),
    });
    const req = createMockReq({
      body: { mode: 'design' },
      appLocals: { freecadRoot: '/tmp/noop', runScript: vi.fn() },
    });
    const res = createMockRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'description required for design mode',
    });
  });

  it('calls designFromTextFn and returns result for design mode', async () => {
    const designFromTextFn = vi.fn(async () => ({
      toml: 'name = "gear"',
      report: { mechanism_type: 'gear', dof: 1 },
    }));
    const handler = createDesignHandler({ designFromTextFn });
    const req = createMockReq({
      body: { mode: 'design', description: 'Create a simple gear mechanism' },
      appLocals: { freecadRoot: '/tmp/root', runScript: vi.fn() },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(designFromTextFn).toHaveBeenCalledWith('Create a simple gear mechanism');
    expect(res.jsonBody).toEqual({
      toml: 'name = "gear"',
      report: { mechanism_type: 'gear', dof: 1 },
    });
  });

  it('throws 400 when toml is missing for review mode', async () => {
    const handler = createDesignHandler({
      designFromTextFn: vi.fn(),
      reviewTomlFn: vi.fn(),
      validateTomlFn: vi.fn(),
    });
    const req = createMockReq({
      body: { mode: 'review' },
      appLocals: { freecadRoot: '/tmp/noop', runScript: vi.fn() },
    });
    const res = createMockRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'toml required for review mode',
    });
  });

  it('throws 400 when toml is missing for build mode', async () => {
    const handler = createDesignHandler({
      designFromTextFn: vi.fn(),
      reviewTomlFn: vi.fn(),
      validateTomlFn: vi.fn(),
    });
    const req = createMockReq({
      body: { mode: 'build' },
      appLocals: { freecadRoot: '/tmp/noop', runScript: vi.fn() },
    });
    const res = createMockRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'toml required for build mode',
    });
  });

  it('build mode parses TOML via loadConfig and passes config to runScript', async () => {
    const loadConfig = vi.fn(async () => ({ name: 'gear', parts: [] }));
    const runScript = vi.fn(async () => ({ exports: [{ format: 'step', path: 'out.step' }] }));
    const handler = createDesignHandler({});
    const req = createMockReq({
      body: { mode: 'build', toml: 'name = "gear"' },
      appLocals: { freecadRoot: '/tmp/fc', runScript, loadConfig },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(runScript).toHaveBeenCalledWith(
      'create_model.py',
      { name: 'gear', parts: [] },
      { timeout: 120_000 },
    );
    expect(res.jsonBody).toHaveProperty('exports');
    expect(res.jsonBody).toHaveProperty('configPath');
  });

  it('cleans up tmp file after review mode', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'design-review-'));
    let capturedPath = null;
    const reviewTomlFn = vi.fn(async (tmpPath) => {
      capturedPath = tmpPath;
      return { issues: [], score: 95 };
    });
    const validateTomlFn = vi.fn(() => ({ valid: true, errors: [] }));

    const handler = createDesignHandler({ reviewTomlFn, validateTomlFn });
    const req = createMockReq({
      body: { mode: 'review', toml: 'name = "test"' },
      appLocals: { freecadRoot, runScript: vi.fn(), loadConfig: vi.fn() },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(capturedPath).toBeTruthy();
    // Tmp file should be deleted after handler completes
    await expect(access(capturedPath)).rejects.toBeTruthy();
  });

  it('throws 400 for unknown mode', async () => {
    const handler = createDesignHandler({
      designFromTextFn: vi.fn(),
      reviewTomlFn: vi.fn(),
      validateTomlFn: vi.fn(),
    });
    const req = createMockReq({
      body: { mode: 'foobar' },
      appLocals: { freecadRoot: '/tmp/noop', runScript: vi.fn() },
    });
    const res = createMockRes();

    await expect(handler(req, res)).rejects.toMatchObject({
      status: 400,
      message: 'unknown mode: foobar',
    });
  });
});

// @vitest-environment node
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

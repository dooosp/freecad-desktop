// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes } from './handler-test-helpers.js';
import { createDiagnosticsHandler, REQUIRED_SCRIPTS } from './handlers/diagnostics-handler.js';

describe('diagnostics route handler', () => {
  it('returns pass when all required checks pass', async () => {
    const checkExistsFn = vi.fn(async () => true);
    const checkWritableFn = vi.fn(async () => true);
    const runCmdFn = vi.fn(async (cmd, args) => {
      if (cmd === 'which' && args[0] === 'wslpath') return '/usr/bin/wslpath';
      if (args[0] === '--version') return 'Python 3.11.9';
      if (args[0] === '-c') return '1.0';
      return null;
    });
    const getPythonCandidatesFn = vi.fn(async () => ['python3']);

    const handler = createDiagnosticsHandler({ checkExistsFn, checkWritableFn, runCmdFn, getPythonCandidatesFn });
    const req = createMockReq({ appLocals: { freecadRoot: '/tmp/freecad-root' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.overall).toBe('pass');
    expect(res.jsonBody.checks).toHaveLength(6);
    expect(res.jsonBody.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('returns warn when optional checks are degraded but required checks pass', async () => {
    const checkExistsFn = vi.fn(async () => true);
    const checkWritableFn = vi.fn(async (path) => !path.endsWith('/output'));
    const runCmdFn = vi.fn(async (cmd, args) => {
      if (cmd === 'which' && args[0] === 'wslpath') return null;
      if (args[0] === '--version') return 'Python 3.11.9';
      if (args[0] === '-c') return '1.0';
      return null;
    });
    const getPythonCandidatesFn = vi.fn(async () => ['python3']);

    const handler = createDiagnosticsHandler({ checkExistsFn, checkWritableFn, runCmdFn, getPythonCandidatesFn });
    const req = createMockReq({ appLocals: { freecadRoot: '/tmp/freecad-root' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.jsonBody.overall).toBe('warn');
    const byId = Object.fromEntries(res.jsonBody.checks.map((c) => [c.id, c]));
    expect(byId.wslpath.status).toBe('warn');
    expect(byId.outputDir.status).toBe('warn');
    expect(byId.python.status).toBe('pass');
    expect(byId.scripts.status).toBe('pass');
  });

  it('returns fail when required script is missing', async () => {
    const missingScript = REQUIRED_SCRIPTS[0];
    const checkExistsFn = vi.fn(async (path) => {
      if (path.endsWith(`/scripts/${missingScript}`)) return false;
      return true;
    });
    const checkWritableFn = vi.fn(async () => true);
    const runCmdFn = vi.fn(async (cmd, args) => {
      if (cmd === 'which' && args[0] === 'wslpath') return '/usr/bin/wslpath';
      if (args[0] === '--version') return 'Python 3.11.9';
      if (args[0] === '-c') return '1.0';
      return null;
    });
    const getPythonCandidatesFn = vi.fn(async () => ['python3']);

    const handler = createDiagnosticsHandler({ checkExistsFn, checkWritableFn, runCmdFn, getPythonCandidatesFn });
    const req = createMockReq({ appLocals: { freecadRoot: '/tmp/freecad-root' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.jsonBody.overall).toBe('fail');
    const scriptCheck = res.jsonBody.checks.find((c) => c.id === 'scripts');
    expect(scriptCheck.status).toBe('fail');
    expect(scriptCheck.detail).toContain(missingScript);
  });
});

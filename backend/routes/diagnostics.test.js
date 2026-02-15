// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createMockReq, createMockRes } from './handler-test-helpers.js';
import {
  checkExists,
  checkWritable,
  createDiagnosticsHandler,
  getPythonCandidates,
  REQUIRED_SCRIPTS,
  runCmd,
} from './handlers/diagnostics-handler.js';

const tempRoots = [];

afterEach(async () => {
  await Promise.allSettled(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('diagnostics helper functions', () => {
  it('checkExists/checkWritable report filesystem access state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diag-helper-test-'));
    tempRoots.push(root);
    const writableFile = join(root, 'ok.txt');
    await writeFile(writableFile, 'ok', 'utf8');

    expect(await checkExists(writableFile)).toBe(true);
    expect(await checkExists(join(root, 'missing.txt'))).toBe(false);
    expect(await checkWritable(writableFile)).toBe(true);
  });

  it('runCmd returns trimmed stdout and null on failure', async () => {
    const ok = await runCmd('printf', ['  hello  \n']);
    expect(ok).toBe('hello');

    const fail = await runCmd('node', ['-e', 'process.exit(3)']);
    expect(fail).toBeNull();
  });

  it('getPythonCandidates merges env + discovered path + python3 without duplicates', async () => {
    const prevWsl = process.env.PYTHON_EXE_WSL;
    const prevPy = process.env.PYTHON_EXE;
    process.env.PYTHON_EXE_WSL = '/opt/custom/python';
    process.env.PYTHON_EXE = '/opt/custom/python';

    const runCmdFn = vi.fn(async (cmd) => {
      if (cmd === 'wslpath') return '/mnt/c/Program Files/FreeCAD 1.0/bin/python.exe';
      return null;
    });
    const candidates = await getPythonCandidates(runCmdFn);

    expect(candidates).toContain('/opt/custom/python');
    expect(candidates).toContain('/mnt/c/Program Files/FreeCAD 1.0/bin/python.exe');
    expect(candidates).toContain('python3');
    expect(new Set(candidates).size).toBe(candidates.length);

    if (prevWsl === undefined) delete process.env.PYTHON_EXE_WSL;
    else process.env.PYTHON_EXE_WSL = prevWsl;
    if (prevPy === undefined) delete process.env.PYTHON_EXE;
    else process.env.PYTHON_EXE = prevPy;
  });
});

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

  it('returns fail when core dependencies are unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diag-handler-test-'));
    tempRoots.push(root);
    await mkdir(join(root, 'scripts'), { recursive: true });
    await mkdir(join(root, 'output'), { recursive: true });

    const checkExistsFn = vi.fn(async (path) => {
      if (path === root) return false;
      if (path.endsWith('/output')) return false;
      return true;
    });
    const checkWritableFn = vi.fn(async () => false);
    const runCmdFn = vi.fn(async (cmd, args) => {
      if (cmd === 'which' && args[0] === 'wslpath') return null;
      if (args[0] === '--version') return null;
      if (args[0] === '-c') return null;
      return null;
    });
    const getPythonCandidatesFn = vi.fn(async () => ['pythonA', 'pythonB']);

    const handler = createDiagnosticsHandler({ checkExistsFn, checkWritableFn, runCmdFn, getPythonCandidatesFn });
    const req = createMockReq({ appLocals: { freecadRoot: root } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.jsonBody.overall).toBe('fail');
    const byId = Object.fromEntries(res.jsonBody.checks.map((c) => [c.id, c]));
    expect(byId.freecadRoot.status).toBe('fail');
    expect(byId.wslpath.status).toBe('warn');
    expect(byId.python.status).toBe('fail');
    expect(byId.freecadModule.status).toBe('fail');
    expect(byId.outputDir.status).toBe('fail');
    expect(byId.python.detail).toContain('pythonA, pythonB');
  });
});

// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CURATED_EXAMPLES,
  createBackendApp,
  createCorsMiddleware,
  createErrorMiddleware,
  loadBackendDeps,
  loadRouteModules,
  startBackendServer,
} from './server.js';

function createMockRes() {
  return {
    statusCode: 200,
    headersSent: false,
    headers: {},
    jsonBody: null,
    sentStatus: null,
    header(key, value) {
      this.headers[key] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
    sendStatus(code) {
      this.sentStatus = code;
      this.statusCode = code;
      return this;
    },
  };
}

function createNoopRouters() {
  const noop = (_req, _res, next) => next?.();
  return {
    analyzeRouter: noop,
    dfmRouter: noop,
    drawingRouter: noop,
    toleranceRouter: noop,
    costRouter: noop,
    reportRouter: noop,
    stepImportRouter: noop,
    profileRouter: noop,
    reportTemplateRouter: noop,
    exportPackRouter: noop,
    cacheRouter: noop,
    projectRouter: noop,
    diagnosticsRouter: noop,
  };
}

const tempRoots = [];

afterEach(async () => {
  await Promise.allSettled(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('server bootstrap helpers', () => {
  it('applies CORS headers and handles OPTIONS short-circuit', () => {
    const cors = createCorsMiddleware();
    const req = { method: 'OPTIONS' };
    const res = createMockRes();
    const next = vi.fn();

    cors(req, res, next);

    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET,POST,PUT,DELETE,OPTIONS');
    expect(res.sentStatus).toBe(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next for non-OPTIONS requests in CORS middleware', () => {
    const cors = createCorsMiddleware();
    const req = { method: 'POST' };
    const res = createMockRes();
    const next = vi.fn();

    cors(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.sentStatus).toBe(null);
  });

  it('creates error middleware that logs and returns json payload', () => {
    const logger = { error: vi.fn(), log: vi.fn() };
    const middleware = createErrorMiddleware(logger);
    const req = { method: 'POST', path: '/api/report' };
    const res = createMockRes();
    const next = vi.fn();

    middleware(Object.assign(new Error('boom'), { status: 418 }), req, res, next);

    expect(logger.error).toHaveBeenCalledWith('[POST /api/report] boom');
    expect(res.statusCode).toBe(418);
    expect(res.jsonBody).toEqual({ error: 'boom' });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards to next when headers are already sent', () => {
    const middleware = createErrorMiddleware({ error: vi.fn(), log: vi.fn() });
    const req = { method: 'GET', path: '/api/health' };
    const res = createMockRes();
    res.headersSent = true;
    const next = vi.fn();
    const err = new Error('late error');

    middleware(err, req, res, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.jsonBody).toBe(null);
  });

  it('builds app with locals and builtin endpoint handlers', async () => {
    const runScript = vi.fn(async (script) => ({ script, ok: true }));
    const loadConfig = vi.fn(async () => ({}));
    const deepMerge = vi.fn((a, b) => ({ ...a, ...b }));
    const logger = { error: vi.fn(), log: vi.fn() };

    const app = await createBackendApp({
      freecadRoot: '/tmp/freecad-root',
      runScript,
      loadConfig,
      deepMerge,
      routers: createNoopRouters(),
      logger,
    });

    expect(app.locals.freecadRoot).toBe('/tmp/freecad-root');
    expect(app.locals.runScript).toBe(runScript);
    expect(app.locals.loadConfig).toBe(loadConfig);
    expect(app.locals.deepMerge).toBe(deepMerge);

    const layers = app.router?.stack || [];
    const routeByPath = (path) => layers.find((layer) => layer.route?.path === path);

    expect(routeByPath('/api/examples')).toBeTruthy();
    expect(routeByPath('/api/inspect')).toBeTruthy();
    expect(routeByPath('/api/create')).toBeTruthy();
    expect(routeByPath('/api/health')).toBeTruthy();

    const examplesRes = createMockRes();
    routeByPath('/api/examples').route.stack[0].handle({}, examplesRes);
    expect(examplesRes.jsonBody).toEqual(CURATED_EXAMPLES);

    const healthRes = createMockRes();
    routeByPath('/api/health').route.stack[0].handle({}, healthRes);
    expect(healthRes.jsonBody).toEqual({ status: 'ok', freecadRoot: '/tmp/freecad-root' });

    const inspectRes = createMockRes();
    routeByPath('/api/inspect').route.stack[0].handle(
      { body: { file: 'a.step' }, app: { locals: app.locals } },
      inspectRes,
      () => {}
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runScript).toHaveBeenCalledWith('inspect_model.py', { file: 'a.step' }, { timeout: 60_000 });
    expect(inspectRes.jsonBody).toEqual({ script: 'inspect_model.py', ok: true });

    const createRes = createMockRes();
    routeByPath('/api/create').route.stack[0].handle(
      { body: { config: 'x' }, app: { locals: app.locals } },
      createRes,
      () => {}
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runScript).toHaveBeenCalledWith('create_model.py', { config: 'x' }, { timeout: 120_000 });
    expect(createRes.jsonBody).toEqual({ script: 'create_model.py', ok: true });
  });

  it('loads backend deps from a provided freecad root', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'server-deps-'));
    tempRoots.push(freecadRoot);
    await mkdir(join(freecadRoot, 'lib'), { recursive: true });

    await writeFile(
      join(freecadRoot, 'lib', 'runner.js'),
      'export async function runScript(name,input){ return { from: "runner", name, input }; }\n',
      'utf8'
    );
    await writeFile(
      join(freecadRoot, 'lib', 'config-loader.js'),
      'export async function loadConfig(path){ return { from: "loader", path }; }\nexport function deepMerge(a,b){ return { ...a, ...b, merged: true }; }\n',
      'utf8'
    );

    const deps = await loadBackendDeps(freecadRoot);
    expect(await deps.runScript('x.py', { a: 1 })).toEqual({ from: 'runner', name: 'x.py', input: { a: 1 } });
    expect(await deps.loadConfig('cfg.toml')).toEqual({ from: 'loader', path: 'cfg.toml' });
    expect(deps.deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2, merged: true });
  });

  it('loads route modules and starts backend server via injected createServer', async () => {
    const modules = await loadRouteModules();
    expect(modules.analyzeRouter).toBeTruthy();
    expect(modules.profileRouter).toBeTruthy();
    expect(modules.reportTemplateRouter).toBeTruthy();

    const logger = { log: vi.fn(), error: vi.fn() };
    const fakeServer = {
      listening: false,
      listen: vi.fn((_port, cb) => {
        fakeServer.listening = true;
        cb();
      }),
      close: vi.fn((cb) => {
        fakeServer.listening = false;
        cb?.();
      }),
    };
    const createServerFn = vi.fn(() => fakeServer);

    const { server } = await startBackendServer({
      port: 0,
      freecadRoot: '/tmp/freecad-root',
      logger,
      runScript: async () => ({}),
      loadConfig: async () => ({}),
      deepMerge: (a, b) => ({ ...a, ...b }),
      routers: createNoopRouters(),
      createServerFn,
    });

    expect(server.listening).toBe(true);
    expect(createServerFn).toHaveBeenCalledTimes(1);
    expect(fakeServer.listen).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledTimes(1);
  });
});

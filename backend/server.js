import express from 'express';
import { createServer } from 'node:http';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncHandler } from './lib/async-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_FREECAD_ROOT = resolve(__dirname, '..', '..', 'freecad-automation');
export const CURATED_EXAMPLES = [
  'ks_flange.toml',
  'ks_shaft.toml',
  'ks_bracket.toml',
  'ks_gear_housing.toml',
];

export function createCorsMiddleware() {
  return (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    return next();
  };
}

export function createErrorMiddleware(logger = console) {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err?.status || 500;
    const message = err?.message || 'Internal Server Error';
    logger.error(`[${req.method} ${req.path}] ${message}`);
    return res.status(status).json({ error: message });
  };
}

export async function loadBackendDeps(freecadRoot = DEFAULT_FREECAD_ROOT) {
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);
  const { loadConfig, deepMerge } = await import(`${freecadRoot}/lib/config-loader.js`);
  return { runScript, loadConfig, deepMerge };
}

export async function loadRouteModules() {
  const { default: analyzeRouter } = await import('./routes/analyze.js');
  const { default: dfmRouter } = await import('./routes/dfm.js');
  const { default: drawingRouter } = await import('./routes/drawing.js');
  const { default: toleranceRouter } = await import('./routes/tolerance.js');
  const { default: costRouter } = await import('./routes/cost.js');
  const { default: reportRouter } = await import('./routes/report.js');
  const { default: stepImportRouter } = await import('./routes/step-import.js');
  const { default: profileRouter } = await import('./routes/profile.js');
  const { default: reportTemplateRouter } = await import('./routes/report-template.js');
  const { default: exportPackRouter } = await import('./routes/export-pack.js');
  const { default: cacheRouter } = await import('./routes/cache.js');
  const { default: projectRouter } = await import('./routes/project.js');
  const { default: diagnosticsRouter } = await import('./routes/diagnostics.js');

  return {
    analyzeRouter,
    dfmRouter,
    drawingRouter,
    toleranceRouter,
    costRouter,
    reportRouter,
    stepImportRouter,
    profileRouter,
    reportTemplateRouter,
    exportPackRouter,
    cacheRouter,
    projectRouter,
    diagnosticsRouter,
  };
}

function mountRoutes(app, routers) {
  app.use('/api', routers.analyzeRouter);
  app.use('/api', routers.dfmRouter);
  app.use('/api', routers.drawingRouter);
  app.use('/api', routers.toleranceRouter);
  app.use('/api', routers.costRouter);
  app.use('/api', routers.reportRouter);
  app.use('/api', routers.stepImportRouter);
  app.use('/api/profiles', routers.profileRouter);
  app.use('/api/report-templates', routers.reportTemplateRouter);
  app.use('/api/export-pack', routers.exportPackRouter);
  app.use('/api/cache', routers.cacheRouter);
  app.use('/api/project', routers.projectRouter);
  app.use('/api/diagnostics', routers.diagnosticsRouter);
}

function registerBuiltinEndpoints(app, freecadRoot) {
  app.use('/artifacts', express.static(join(freecadRoot, 'output')));
  app.use('/configs', express.static(join(freecadRoot, 'configs')));

  app.get('/api/examples', (_req, res) => {
    res.json(CURATED_EXAMPLES);
  });

  app.post('/api/inspect', asyncHandler(async (req, res) => {
    const result = await req.app.locals.runScript('inspect_model.py', req.body, { timeout: 60_000 });
    res.json(result);
  }));

  app.post('/api/create', asyncHandler(async (req, res) => {
    const result = await req.app.locals.runScript('create_model.py', req.body, { timeout: 120_000 });
    res.json(result);
  }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', freecadRoot });
  });
}

export async function createBackendApp({
  freecadRoot = DEFAULT_FREECAD_ROOT,
  runScript,
  loadConfig,
  deepMerge,
  routers,
  logger = console,
} = {}) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(createCorsMiddleware());

  const deps = (runScript && loadConfig && deepMerge)
    ? { runScript, loadConfig, deepMerge }
    : await loadBackendDeps(freecadRoot);
  const routeModules = routers || await loadRouteModules();

  app.locals.freecadRoot = freecadRoot;
  app.locals.runScript = deps.runScript;
  app.locals.loadConfig = deps.loadConfig;
  app.locals.deepMerge = deps.deepMerge;

  mountRoutes(app, routeModules);
  registerBuiltinEndpoints(app, freecadRoot);
  app.use(createErrorMiddleware(logger));

  return app;
}

export async function startBackendServer({
  port = process.env.PORT || 18080,
  freecadRoot = DEFAULT_FREECAD_ROOT,
  logger = console,
  runScript,
  loadConfig,
  deepMerge,
  routers,
} = {}) {
  const app = await createBackendApp({
    freecadRoot,
    runScript,
    loadConfig,
    deepMerge,
    routers,
    logger,
  });

  const server = createServer(app);
  await new Promise((resolveListen) => {
    server.listen(port, resolveListen);
  });
  logger.log(`FreeCAD Studio backend running on http://localhost:${port}`);
  return { app, server, port, freecadRoot };
}

function isMainModule() {
  const entry = process.argv[1];
  return Boolean(entry && resolve(entry) === __filename);
}

if (isMainModule()) {
  startBackendServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

import express from 'express';
import { createServer } from 'node:http';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncHandler } from './lib/async-handler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FREECAD_ROOT = resolve(__dirname, '..', '..', 'freecad-automation');

const app = express();
app.use(express.json({ limit: '10mb' }));

const { runScript } = await import(`${FREECAD_ROOT}/lib/runner.js`);
const { loadConfig, deepMerge } = await import(`${FREECAD_ROOT}/lib/config-loader.js`);

// CORS for dev mode
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Make freecad-automation root available to routes
app.locals.freecadRoot = FREECAD_ROOT;
app.locals.runScript = runScript;
app.locals.loadConfig = loadConfig;
app.locals.deepMerge = deepMerge;

// Routes
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

app.use('/api', analyzeRouter);
app.use('/api', dfmRouter);
app.use('/api', drawingRouter);
app.use('/api', toleranceRouter);
app.use('/api', costRouter);
app.use('/api', reportRouter);
app.use('/api', stepImportRouter);
app.use('/api/profiles', profileRouter);
app.use('/api/report-templates', reportTemplateRouter);
app.use('/api/export-pack', exportPackRouter);
app.use('/api/cache', cacheRouter);
app.use('/api/project', projectRouter);
app.use('/api/diagnostics', diagnosticsRouter);

// Serve static artifacts (SVG drawings, STL files, etc.)
app.use('/artifacts', express.static(join(FREECAD_ROOT, 'output')));
app.use('/configs', express.static(join(FREECAD_ROOT, 'configs')));

// Curated example configs for the desktop app
const CURATED_EXAMPLES = [
  'ks_flange.toml',
  'ks_shaft.toml',
  'ks_bracket.toml',
  'ks_gear_housing.toml',
];

app.get('/api/examples', (req, res) => {
  res.json(CURATED_EXAMPLES);
});

// Inspect STEP file
app.post('/api/inspect', asyncHandler(async (req, res) => {
  const result = await req.app.locals.runScript('inspect_model.py', req.body, { timeout: 60_000 });
  res.json(result);
}));

// Create model from config
app.post('/api/create', asyncHandler(async (req, res) => {
  const result = await req.app.locals.runScript('create_model.py', req.body, { timeout: 120_000 });
  res.json(result);
}));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', freecadRoot: FREECAD_ROOT });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err?.status || 500;
  const message = err?.message || 'Internal Server Error';
  console.error(`[${req.method} ${req.path}] ${message}`);
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 18080;
const server = createServer(app);
server.listen(PORT, () => {
  console.log(`FreeCAD Studio backend running on http://localhost:${PORT}`);
});

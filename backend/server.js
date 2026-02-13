import express from 'express';
import { createServer } from 'node:http';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FREECAD_ROOT = resolve(__dirname, '..', '..', 'freecad-automation');

const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS for dev mode
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Make freecad-automation root available to routes
app.locals.freecadRoot = FREECAD_ROOT;

// Routes
const { default: analyzeRouter } = await import('./routes/analyze.js');
const { default: dfmRouter } = await import('./routes/dfm.js');
const { default: drawingRouter } = await import('./routes/drawing.js');
const { default: toleranceRouter } = await import('./routes/tolerance.js');
const { default: costRouter } = await import('./routes/cost.js');
const { default: reportRouter } = await import('./routes/report.js');

app.use('/api', analyzeRouter);
app.use('/api', dfmRouter);
app.use('/api', drawingRouter);
app.use('/api', toleranceRouter);
app.use('/api', costRouter);
app.use('/api', reportRouter);

// Serve static artifacts (SVG drawings, STL files, etc.)
app.use('/artifacts', express.static(join(FREECAD_ROOT, 'output')));
app.use('/configs', express.static(join(FREECAD_ROOT, 'configs')));

// List example configs
app.get('/api/examples', async (req, res) => {
  const { readdir } = await import('node:fs/promises');
  const dir = join(FREECAD_ROOT, 'configs', 'examples');
  try {
    const files = await readdir(dir);
    res.json(files.filter(f => f.endsWith('.toml')));
  } catch {
    res.json([]);
  }
});

// Inspect STEP file
app.post('/api/inspect', async (req, res) => {
  const { runScript } = await import(`${FREECAD_ROOT}/lib/runner.js`);
  try {
    const result = await runScript('inspect_model.py', req.body, { timeout: 60_000 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create model from config
app.post('/api/create', async (req, res) => {
  const { runScript } = await import(`${FREECAD_ROOT}/lib/runner.js`);
  try {
    const result = await runScript('create_model.py', req.body, { timeout: 120_000 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', freecadRoot: FREECAD_ROOT });
});

const PORT = process.env.PORT || 18080;
const server = createServer(app);
server.listen(PORT, () => {
  console.log(`FreeCAD Studio backend running on http://localhost:${PORT}`);
});

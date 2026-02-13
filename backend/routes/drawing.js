import { Router } from 'express';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { runQaScorer } from '../lib/qa-runner.js';

const router = Router();

/**
 * POST /api/drawing - Generate KS engineering drawing
 * Input: { configPath: string, preset?: string }
 */
router.post('/drawing', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);
  const { loadConfig, deepMerge } = await import(`${freecadRoot}/lib/config-loader.js`);

  const { configPath, preset } = req.body;
  if (!configPath) return res.status(400).json({ error: 'configPath required' });

  try {
    let config = await loadConfig(resolve(freecadRoot, configPath));

    // Apply preset override if specified
    if (preset) {
      const presetPath = resolve(freecadRoot, 'configs', 'overrides', 'presets', `${preset}.toml`);
      const presetConfig = await loadConfig(presetPath);
      config = deepMerge(config, presetConfig);
    }

    if (!config.drawing) config.drawing = {};

    const result = await runScript('generate_drawing.py', config, { timeout: 120_000 });

    // Read SVG content
    const svgEntry = result.drawing_paths?.find(p => p.format === 'svg');
    const svgPath = result.svg_path || result.drawing_path || svgEntry?.path;
    if (svgPath) {
      try {
        const { toWSL } = await import(`${freecadRoot}/lib/paths.js`);
        const svgWSL = toWSL(svgPath);
        result.svgContent = await readFile(svgWSL, 'utf8');
      } catch { /* SVG read optional */ }
      try {
        result.qa = await runQaScorer(freecadRoot, svgPath);
      } catch { /* QA optional */ }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

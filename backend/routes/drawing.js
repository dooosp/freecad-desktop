import { Router } from 'express';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

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
    if (result.svg_path || result.drawing_path) {
      try {
        const { toWSL } = await import(`${freecadRoot}/lib/paths.js`);
        const svgWSL = toWSL(result.svg_path || result.drawing_path);
        result.svgContent = await readFile(svgWSL, 'utf8');
      } catch { /* SVG read optional */ }
    }

    // Run QA scoring
    try {
      const qaResult = await runScript('qa_scorer.py', {
        ...config,
        svg_path: result.svg_path,
      }, { timeout: 60_000 });
      result.qa = qaResult;
    } catch { /* QA optional */ }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

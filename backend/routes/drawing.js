import { Router } from 'express';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { runQaScorer } from '../lib/qa-runner.js';
import { postprocessSvg } from '../lib/svg-postprocess.js';

const router = Router();

/**
 * POST /api/drawing - Generate KS engineering drawing
 * Input: { configPath: string, preset?: string, weightsPreset?: string }
 */
router.post('/drawing', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);
  const { loadConfig, deepMerge } = await import(`${freecadRoot}/lib/config-loader.js`);

  const { configPath, preset, weightsPreset } = req.body;
  if (!configPath) return res.status(400).json({ error: 'configPath required' });

  try {
    const fullConfigPath = resolve(freecadRoot, configPath);
    let config = await loadConfig(fullConfigPath);

    // Apply preset override if specified
    if (preset) {
      const presetPath = resolve(freecadRoot, 'configs', 'overrides', 'presets', `${preset}.toml`);
      const presetConfig = await loadConfig(presetPath);
      config = deepMerge(config, presetConfig);
    }

    if (!config.drawing) config.drawing = {};

    const hasShapes = Array.isArray(config.shapes) && config.shapes.length > 0;
    const hasParts = Array.isArray(config.parts) && config.parts.length > 0;
    if (!hasShapes && !hasParts && config.import?.source_step) {
      return res.status(400).json({
        error: 'Drawing generation is not available for STEP template-only configs. Add [[shapes]] or [[parts]] before generating drawing.',
      });
    }

    const result = await runScript('generate_drawing.py', config, { timeout: 120_000 });

    // Read SVG content
    const svgEntry = result.drawing_paths?.find(p => p.format === 'svg');
    const svgPath = result.svg_path || result.drawing_path || svgEntry?.path;
    if (svgPath) {
      try {
        await postprocessSvg(freecadRoot, svgPath, {
          profile: config.drawing_plan?.style?.stroke_profile || 'ks',
        });
      } catch { /* Post-process optional */ }
      try {
        const { toWSL } = await import(`${freecadRoot}/lib/paths.js`);
        const svgWSL = toWSL(svgPath);
        result.svgContent = await readFile(svgWSL, 'utf8');
      } catch { /* SVG read optional */ }
      try {
        result.qa = await runQaScorer(freecadRoot, svgPath, {
          weightsPreset,
        });
      } catch { /* QA optional */ }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { runQaScorer } from '../../lib/qa-runner.js';
import { postprocessSvg } from '../../lib/svg-postprocess.js';
import { createHttpError } from '../../lib/async-handler.js';

async function toWSLPath(freecadRoot, path) {
  const { toWSL } = await import(`${freecadRoot}/lib/paths.js`);
  return toWSL(path);
}

export function createDrawingHandler({
  readFileFn = readFile,
  runQaScorerFn = runQaScorer,
  postprocessSvgFn = postprocessSvg,
  toWSLPathFn = toWSLPath,
} = {}) {
  return async function drawingHandler(req, res) {
    const { freecadRoot, runScript, loadConfig, deepMerge } = req.app.locals;
    const { configPath, preset, weightsPreset } = req.body;

    if (!configPath) throw createHttpError(400, 'configPath required');

    const fullConfigPath = resolve(freecadRoot, configPath);
    let config = await loadConfig(fullConfigPath);
    config.standard = req.body.standard || 'KS';

    if (preset) {
      const presetPath = resolve(freecadRoot, 'configs', 'overrides', 'presets', `${preset}.toml`);
      const presetConfig = await loadConfig(presetPath);
      config = deepMerge(config, presetConfig);
    }

    if (!config.drawing) config.drawing = {};

    const hasShapes = Array.isArray(config.shapes) && config.shapes.length > 0;
    const hasParts = Array.isArray(config.parts) && config.parts.length > 0;
    if (!hasShapes && !hasParts && config.import?.source_step) {
      throw createHttpError(
        400,
        'Drawing generation is not available for STEP template-only configs. Add [[shapes]] or [[parts]] before generating drawing.'
      );
    }

    const drawConfig = { ...config };
    if (req.body.dxfExport) drawConfig.drawing.dxf = true;

    const result = await runScript('generate_drawing.py', drawConfig, { timeout: 120_000 });
    const svgEntry = result.drawing_paths?.find((path) => path.format === 'svg');
    const svgPath = result.svg_path || result.drawing_path || svgEntry?.path;

    if (svgPath) {
      try {
        await postprocessSvgFn(freecadRoot, svgPath, {
          profile: drawConfig.drawing_plan?.style?.stroke_profile || 'ks',
        });
      } catch {
        // Post-process optional
      }

      try {
        const svgWSLPath = await toWSLPathFn(freecadRoot, svgPath);
        result.svgContent = await readFileFn(svgWSLPath, 'utf8');
      } catch {
        // SVG read optional
      }

      try {
        result.qa = await runQaScorerFn(freecadRoot, svgPath, { weightsPreset });
      } catch {
        // QA optional
      }
    }

    res.json(result);
  };
}

export const generateDrawingHandler = createDrawingHandler();

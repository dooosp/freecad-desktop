import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runQaScorer } from '../lib/qa-runner.js';
import { postprocessSvg } from '../lib/svg-postprocess.js';

const router = Router();

/**
 * POST /api/analyze - All-in-one analysis pipeline with SSE progress streaming
 * Input: { configPath: string, options: { dfm, drawing, tolerance, process, material, batch, monteCarlo, mcSamples, weightsPreset } }
 * Output: Server-Sent Events stream
 *   event: stage  → { stage, status: "start"|"done"|"error", error? }
 *   event: complete → full results JSON
 */
router.post('/analyze', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);
  const { loadConfig } = await import(`${freecadRoot}/lib/config-loader.js`);

  const { configPath, options = {} } = req.body;
  if (!configPath) return res.status(400).json({ error: 'configPath required' });

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const fullPath = resolve(freecadRoot, configPath);
  const results = { stages: [], errors: [] };

  try {
    const config = await loadConfig(fullPath);
    const hasShapes = Array.isArray(config.shapes) && config.shapes.length > 0;
    const hasAssemblyParts = Array.isArray(config.parts) && config.parts.length > 0;
    const hasAssembly = Boolean(config.assembly);
    const canCreateModel = hasShapes || hasAssemblyParts;

    // Stage 1: Create model
    send('stage', { stage: 'create', status: 'start' });
    try {
      if (!canCreateModel) {
        const errMsg = config.import?.source_step
          ? 'Imported STEP template has no shapes/parts yet. Edit the generated TOML before Analyze.'
          : 'Config has no shapes/parts. Define geometry before Analyze.';
        throw new Error(errMsg);
      }
      const createResult = await runScript('create_model.py', config, { timeout: 120_000 });
      results.model = createResult;
      results.stages.push('create');
      send('stage', { stage: 'create', status: 'done' });
    } catch (err) {
      results.errors.push({ stage: 'create', error: err.message });
      send('stage', { stage: 'create', status: 'error', error: err.message });
      send('complete', results);
      return res.end();
    }

    // Stage 2: Generate drawing (if enabled)
    if (options.drawing !== false) {
      send('stage', { stage: 'drawing', status: 'start' });
      try {
        const drawConfig = { ...config };
        if (!drawConfig.drawing) drawConfig.drawing = {};
        const drawResult = await runScript('generate_drawing.py', drawConfig, { timeout: 120_000 });
        results.drawing = drawResult;

        const svgEntry = drawResult.drawing_paths?.find(p => p.format === 'svg');
        const svgPath = drawResult.svg_path || drawResult.drawing_path || svgEntry?.path;
        if (svgPath) {
          try {
            await postprocessSvg(freecadRoot, svgPath, {
              profile: drawConfig.drawing_plan?.style?.stroke_profile || 'ks',
            });
          } catch { /* Post-process optional */ }
          try {
            const { toWSL } = await import(`${freecadRoot}/lib/paths.js`);
            const wslSvg = toWSL(svgPath);
            results.drawingSvg = await readFile(wslSvg, 'utf8');
          } catch { /* SVG read optional */ }
          try {
            results.qa = await runQaScorer(freecadRoot, svgPath, {
              weightsPreset: options.weightsPreset,
            });
          } catch { /* QA optional */ }
        }
        results.stages.push('drawing');
        send('stage', { stage: 'drawing', status: 'done' });
      } catch (err) {
        results.errors.push({ stage: 'drawing', error: err.message });
        send('stage', { stage: 'drawing', status: 'error', error: err.message });
      }
    }

    // Stage 3: DFM check (if enabled)
    if (options.dfm !== false) {
      send('stage', { stage: 'dfm', status: 'start' });
      try {
        const dfmConfig = { ...config };
        if (!dfmConfig.manufacturing) dfmConfig.manufacturing = {};
        if (options.process) dfmConfig.manufacturing.process = options.process;
        if (options.material) dfmConfig.manufacturing.material = options.material;
        if (!dfmConfig.manufacturing.process) dfmConfig.manufacturing.process = 'machining';
        const dfmResult = await runScript('dfm_checker.py', dfmConfig, { timeout: 60_000 });
        results.dfm = dfmResult;
        results.stages.push('dfm');
        send('stage', { stage: 'dfm', status: 'done' });
      } catch (err) {
        results.errors.push({ stage: 'dfm', error: err.message });
        send('stage', { stage: 'dfm', status: 'error', error: err.message });
      }
    }

    // Stage 4: Tolerance analysis (if enabled and assembly config exists)
    if (options.tolerance !== false && hasAssembly && hasAssemblyParts) {
      send('stage', { stage: 'tolerance', status: 'start' });
      try {
        const tolConfig = {
          ...config,
          tolerance: { ...(config.tolerance || {}) },
        };
        if (typeof options.monteCarlo === 'boolean') {
          tolConfig.tolerance.monte_carlo = options.monteCarlo;
        }
        const parsedSamples = Number(options.mcSamples);
        if (Number.isFinite(parsedSamples) && parsedSamples > 0) {
          tolConfig.tolerance.mc_samples = Math.floor(parsedSamples);
        }
        const tolResult = await runScript('tolerance_analysis.py', tolConfig, { timeout: 60_000 });
        results.tolerance = tolResult;
        results.stages.push('tolerance');
        send('stage', { stage: 'tolerance', status: 'done' });
      } catch (err) {
        results.errors.push({ stage: 'tolerance', error: err.message });
        send('stage', { stage: 'tolerance', status: 'error', error: err.message });
      }
    }

    // Stage 5: Cost estimation (if enabled)
    if (options.cost !== false) {
      send('stage', { stage: 'cost', status: 'start' });
      try {
        const costInput = {
          ...config,
          dfm_result: results.dfm || null,
          material: options.material || config.manufacturing?.material || 'SS304',
          process: options.process || config.manufacturing?.process || 'machining',
          batch_size: options.batch || 1,
        };
        const costResult = await runScript('cost_estimator.py', costInput, { timeout: 60_000 });
        results.cost = costResult;
        results.stages.push('cost');
        send('stage', { stage: 'cost', status: 'done' });
      } catch (err) {
        results.errors.push({ stage: 'cost', error: err.message });
        send('stage', { stage: 'cost', status: 'error', error: err.message });
      }
    }

    send('complete', results);
    res.end();
  } catch (err) {
    send('error', { error: err.message });
    res.end();
  }
});

export default router;

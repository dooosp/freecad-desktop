import { Router } from 'express';
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve, basename, extname, join } from 'node:path';
import { runQaScorer } from '../lib/qa-runner.js';
import { postprocessSvg } from '../lib/svg-postprocess.js';
import { AnalysisCache } from '../lib/analysis-cache.js';

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

  const { configPath, options = {}, profileName = null } = req.body;
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
  const cache = new AnalysisCache(freecadRoot);

  try {
    const config = await loadConfig(fullPath);
    const hasShapes = Array.isArray(config.shapes) && config.shapes.length > 0;
    const hasAssemblyParts = Array.isArray(config.parts) && config.parts.length > 0;
    const hasAssembly = Boolean(config.assembly);
    const canCreateModel = hasShapes || hasAssemblyParts;

    // Load shop profile if specified
    let shopProfile = null;
    if (profileName) {
      try {
        const { readFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const profilePath = join(freecadRoot, 'configs', 'profiles', `${profileName}.json`);
        const profileContent = await readFile(profilePath, 'utf8');
        shopProfile = JSON.parse(profileContent);
      } catch {
        // Profile load failed, continue without it
      }
    }

    // Stage 1: Create model (or STEP Direct Track)
    const isStepDirect = !canCreateModel && !!config.import?.source_step;
    send('stage', { stage: 'create', status: 'start' });
    try {
      if (isStepDirect) {
        // STEP Direct Track: use original STEP, skip create_model.py
        const srcStep = config.import.source_step;
        const inspectResult = await runScript('inspect_model.py', { file: srcStep }, { timeout: 60_000 });
        const model = inspectResult?.model || inspectResult || {};
        const name = config.import?.name || basename(srcStep, extname(srcStep));

        // Copy STEP to output/ so downstream scripts can find it
        const outputDir = join(freecadRoot, 'output');
        await mkdir(outputDir, { recursive: true });
        // source_step may be Linux or Windows path
        let resolvedSrc = srcStep;
        if (srcStep.includes('\\') || /^[A-Z]:/i.test(srcStep)) {
          const { toWSL } = await import(`${freecadRoot}/lib/paths.js`);
          resolvedSrc = toWSL(srcStep);
        }
        const destStep = join(outputDir, `${name}.step`);
        await copyFile(resolvedSrc, destStep).catch(() => {});

        results.model = {
          success: true,
          model: { ...model, name },
          exports: [{ format: 'step', path: `output/${name}.step` }],
          stepDirect: true,
        };
      } else if (!canCreateModel) {
        throw new Error('Config has no shapes/parts. Define geometry before Analyze.');
      } else {
        // Normal TOML Track
        const createKey = cache.getCacheKey('create', config, options);
        const createCached = await cache.checkCache(createKey);
        if (createCached.hit) {
          results.model = createCached.entry.result;
        } else {
          const createResult = await runScript('create_model.py', config, { timeout: 120_000 });
          results.model = createResult;
          await cache.storeCache(createKey, createResult, 'create');
        }
      }
      results.stages.push('create');
      send('stage', { stage: 'create', status: 'done', stepDirect: isStepDirect });
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
        if (isStepDirect) {
          throw new Error('Drawing generation is not available for STEP template-only configs. Add [[shapes]] or [[parts]] before generating drawing.');
        }

        const drawKey = cache.getCacheKey('drawing', config, options);
        const drawCached = await cache.checkCache(drawKey);
        if (drawCached.hit) {
          const drawData = drawCached.entry.result;
          results.drawing = drawData.drawing || drawData;
          if (drawData.drawingSvg) results.drawingSvg = drawData.drawingSvg;
          if (drawData.qa) results.qa = drawData.qa;
        } else {
          const drawConfig = { ...config };
          if (!drawConfig.drawing) drawConfig.drawing = {};
          if (options.dxfExport) drawConfig.drawing.dxf = true;
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
          // Store composite entry with SVG and QA
          const drawComposite = { drawing: drawResult };
          if (results.drawingSvg) drawComposite.drawingSvg = results.drawingSvg;
          if (results.qa) drawComposite.qa = results.qa;
          await cache.storeCache(drawKey, drawComposite, 'drawing');
        }
        results.stages.push('drawing');
        send('stage', { stage: 'drawing', status: 'done', cached: drawCached.hit });
      } catch (err) {
        results.errors.push({ stage: 'drawing', error: err.message });
        send('stage', { stage: 'drawing', status: 'error', error: err.message });
      }
    }

    // Stage 3: DFM check (if enabled)
    if (options.dfm !== false) {
      send('stage', { stage: 'dfm', status: 'start' });
      try {
        const dfmCacheOpts = { ...options, shopProfile: shopProfile || undefined };
        const dfmKey = cache.getCacheKey('dfm', config, dfmCacheOpts);
        const dfmCached = await cache.checkCache(dfmKey);
        if (dfmCached.hit) {
          results.dfm = dfmCached.entry.result;
        } else {
          const dfmConfig = { ...config };
          if (!dfmConfig.manufacturing) dfmConfig.manufacturing = {};
          if (options.process) dfmConfig.manufacturing.process = options.process;
          if (options.material) dfmConfig.manufacturing.material = options.material;
          if (!dfmConfig.manufacturing.process) dfmConfig.manufacturing.process = 'machining';
          if (shopProfile) dfmConfig.shop_profile = shopProfile;

          const dfmResult = await runScript('dfm_checker.py', dfmConfig, { timeout: 60_000 });
          results.dfm = dfmResult;
          await cache.storeCache(dfmKey, dfmResult, 'dfm');
        }
        results.stages.push('dfm');
        send('stage', { stage: 'dfm', status: 'done', cached: dfmCached.hit });
      } catch (err) {
        results.errors.push({ stage: 'dfm', error: err.message });
        send('stage', { stage: 'dfm', status: 'error', error: err.message });
      }
    }

    // Stage 4: Tolerance analysis (if enabled and assembly config exists)
    if (options.tolerance !== false && hasAssembly && hasAssemblyParts) {
      send('stage', { stage: 'tolerance', status: 'start' });
      try {
        const tolKey = cache.getCacheKey('tolerance', config, options);
        const tolCached = await cache.checkCache(tolKey);
        if (tolCached.hit) {
          results.tolerance = tolCached.entry.result;
        } else {
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
          await cache.storeCache(tolKey, tolResult, 'tolerance');
        }
        results.stages.push('tolerance');
        send('stage', { stage: 'tolerance', status: 'done', cached: tolCached.hit });
      } catch (err) {
        results.errors.push({ stage: 'tolerance', error: err.message });
        send('stage', { stage: 'tolerance', status: 'error', error: err.message });
      }
    }

    // Stage 5: Cost estimation (if enabled)
    if (options.cost !== false) {
      send('stage', { stage: 'cost', status: 'start' });
      try {
        const costCacheOpts = {
          ...options,
          shopProfile: shopProfile || undefined,
          dfm_score: results.dfm?.score ?? null,
        };
        const costKey = cache.getCacheKey('cost', config, costCacheOpts);
        const costCached = await cache.checkCache(costKey);
        if (costCached.hit) {
          results.cost = costCached.entry.result;
        } else {
          const costInput = {
            ...config,
            dfm_result: results.dfm || null,
            material: options.material || config.manufacturing?.material || 'SS304',
            process: options.process || config.manufacturing?.process || 'machining',
            batch_size: options.batch || 1,
          };
          if (shopProfile) costInput.shop_profile = shopProfile;

          const costResult = await runScript('cost_estimator.py', costInput, { timeout: 60_000 });
          results.cost = costResult;
          await cache.storeCache(costKey, costResult, 'cost');
        }
        results.stages.push('cost');
        send('stage', { stage: 'cost', status: 'done', cached: costCached.hit });
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

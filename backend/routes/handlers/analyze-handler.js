import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { runQaScorer } from '../../lib/qa-runner.js';
import { postprocessSvg } from '../../lib/svg-postprocess.js';
import { AnalysisCache } from '../../lib/analysis-cache.js';
import { loadShopProfile } from '../../lib/profile-loader.js';

async function toWSLPath(freecadRoot, path) {
  const { toWSL } = await import(`${freecadRoot}/lib/paths.js`);
  return toWSL(path);
}

function createSseSender(res) {
  return (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}

export function createAnalyzeHandler({
  readFileFn = readFile,
  copyFileFn = copyFile,
  mkdirFn = mkdir,
  runQaScorerFn = runQaScorer,
  postprocessSvgFn = postprocessSvg,
  AnalysisCacheClass = AnalysisCache,
  loadShopProfileFn = loadShopProfile,
  toWSLPathFn = toWSLPath,
} = {}) {
  return async function analyzeHandler(req, res) {
    const { freecadRoot, runScript, loadConfig } = req.app.locals;
    const { configPath, options = {}, profileName = null } = req.body;

    if (!configPath) return res.status(400).json({ error: 'configPath required' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = createSseSender(res);
    const fullPath = resolve(freecadRoot, configPath);
    const results = { stages: [], errors: [] };
    const cache = new AnalysisCacheClass(freecadRoot);

    try {
      const config = await loadConfig(fullPath);
      config.standard = options.standard || 'KS';
      const hasShapes = Array.isArray(config.shapes) && config.shapes.length > 0;
      const hasAssemblyParts = Array.isArray(config.parts) && config.parts.length > 0;
      const hasAssembly = Boolean(config.assembly);
      const canCreateModel = hasShapes || hasAssemblyParts;
      const shopProfile = await loadShopProfileFn(freecadRoot, profileName);

      const isStepDirect = !canCreateModel && Boolean(config.import?.source_step);
      send('stage', { stage: 'create', status: 'start' });
      try {
        if (isStepDirect) {
          const srcStep = config.import.source_step;
          const inspectResult = await runScript('inspect_model.py', { file: srcStep }, { timeout: 60_000 });
          const model = inspectResult?.model || inspectResult || {};
          const name = config.import?.name || basename(srcStep, extname(srcStep));

          const outputDir = join(freecadRoot, 'output');
          await mkdirFn(outputDir, { recursive: true });

          let resolvedSrc = srcStep;
          if (srcStep.includes('\\') || /^[A-Z]:/i.test(srcStep)) {
            resolvedSrc = await toWSLPathFn(freecadRoot, srcStep);
          }

          const destStep = join(outputDir, `${name}.step`);
          await copyFileFn(resolvedSrc, destStep).catch(() => {});

          results.model = {
            success: true,
            model: { ...model, name },
            exports: [{ format: 'step', path: `output/${name}.step` }],
            stepDirect: true,
          };
        } else if (!canCreateModel) {
          throw new Error('Config has no shapes/parts. Define geometry before Analyze.');
        } else {
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

      if (options.drawing !== false) {
        send('stage', { stage: 'drawing', status: 'start' });
        try {
          if (isStepDirect) {
            throw new Error(
              'Drawing generation is not available for STEP template-only configs. Add [[shapes]] or [[parts]] before generating drawing.'
            );
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

            const svgEntry = drawResult.drawing_paths?.find((path) => path.format === 'svg');
            const svgPath = drawResult.svg_path || drawResult.drawing_path || svgEntry?.path;

            if (svgPath) {
              try {
                await postprocessSvgFn(freecadRoot, svgPath, {
                  profile: drawConfig.drawing_plan?.style?.stroke_profile || 'ks',
                });
              } catch {
                // Post-process optional
              }

              try {
                const wslSvg = await toWSLPathFn(freecadRoot, svgPath);
                results.drawingSvg = await readFileFn(wslSvg, 'utf8');
              } catch {
                // SVG read optional
              }

              try {
                results.qa = await runQaScorerFn(freecadRoot, svgPath, {
                  weightsPreset: options.weightsPreset,
                });
              } catch {
                // QA optional
              }
            }

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
      return res.end();
    } catch (err) {
      send('error', { error: err.message });
      return res.end();
    }
  };
}

export const runAnalyzeHandler = createAnalyzeHandler();

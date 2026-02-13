import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { runQaScorer } from '../lib/qa-runner.js';

const router = Router();

/**
 * POST /api/analyze - All-in-one analysis pipeline
 * Input: { configPath: string, options: { dfm, drawing, tolerance, process, material, batch } }
 * Runs: create → draw → dfm → tolerance (as enabled)
 */
router.post('/analyze', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);
  const { loadConfig } = await import(`${freecadRoot}/lib/config-loader.js`);

  const { configPath, options = {} } = req.body;
  if (!configPath) return res.status(400).json({ error: 'configPath required' });

  const fullPath = resolve(freecadRoot, configPath);
  const results = { stages: [], errors: [] };

  try {
    const config = await loadConfig(fullPath);
    const stem = config.name || basename(fullPath, '.toml');

    // Stage 1: Create model
    results.stages.push('create');
    try {
      const createResult = await runScript('create_model.py', config, { timeout: 120_000 });
      results.model = createResult;
    } catch (err) {
      results.errors.push({ stage: 'create', error: err.message });
      return res.json(results);
    }

    // Stage 2: Generate drawing (if enabled)
    if (options.drawing !== false) {
      results.stages.push('drawing');
      try {
        const drawConfig = { ...config };
        if (!drawConfig.drawing) drawConfig.drawing = {};
        const drawResult = await runScript('generate_drawing.py', drawConfig, { timeout: 120_000 });
        results.drawing = drawResult;

        // Read SVG if available
        const svgEntry = drawResult.drawing_paths?.find(p => p.format === 'svg');
        const svgPath = drawResult.svg_path || drawResult.drawing_path || svgEntry?.path;
        if (svgPath) {
          try {
            const { toWSL } = await import(`${freecadRoot}/lib/paths.js`);
            const wslSvg = toWSL(svgPath);
            results.drawingSvg = await readFile(wslSvg, 'utf8');
          } catch { /* SVG read optional */ }
        }

        // Run QA scoring
        try {
          results.qa = await runQaScorer(freecadRoot, stem);
        } catch { /* QA optional */ }
      } catch (err) {
        results.errors.push({ stage: 'drawing', error: err.message });
      }
    }

    // Stage 3: DFM check (if enabled)
    if (options.dfm !== false) {
      results.stages.push('dfm');
      try {
        const dfmConfig = { ...config };
        if (!dfmConfig.manufacturing) {
          dfmConfig.manufacturing = { process: options.process || 'machining' };
        }
        const dfmResult = await runScript('dfm_checker.py', dfmConfig, { timeout: 60_000 });
        results.dfm = dfmResult;
      } catch (err) {
        results.errors.push({ stage: 'dfm', error: err.message });
      }
    }

    // Stage 4: Tolerance analysis (if enabled and tolerance section exists)
    if (options.tolerance !== false && config.tolerance) {
      results.stages.push('tolerance');
      try {
        const tolResult = await runScript('tolerance_analysis.py', config, { timeout: 60_000 });
        results.tolerance = tolResult;
      } catch (err) {
        results.errors.push({ stage: 'tolerance', error: err.message });
      }
    }

    // Stage 5: Cost estimation (if enabled)
    if (options.cost !== false) {
      results.stages.push('cost');
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
      } catch (err) {
        results.errors.push({ stage: 'cost', error: err.message });
      }
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

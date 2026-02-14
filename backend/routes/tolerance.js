import { Router } from 'express';
import { resolve } from 'node:path';

const router = Router();

/**
 * POST /api/tolerance - Run tolerance analysis
 * Input: { configPath: string, monteCarlo?: boolean, mcSamples?: number }
 */
router.post('/tolerance', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);
  const { loadConfig } = await import(`${freecadRoot}/lib/config-loader.js`);

  const { configPath, monteCarlo = true, mcSamples } = req.body;
  if (!configPath) return res.status(400).json({ error: 'configPath required' });

  try {
    const config = await loadConfig(resolve(freecadRoot, configPath));
    const hasAssembly = Boolean(config.assembly);
    const hasParts = Array.isArray(config.parts) && config.parts.length > 0;
    if (!hasAssembly || !hasParts) {
      return res.status(400).json({
        error: 'Tolerance analysis requires an assembly config with [assembly] and [[parts]] sections.',
      });
    }

    // tolerance_analysis.py reads flags from config.tolerance.*
    config.tolerance = { ...(config.tolerance || {}) };
    if (typeof monteCarlo === 'boolean') {
      config.tolerance.monte_carlo = monteCarlo;
    }
    const parsedSamples = Number(mcSamples);
    if (Number.isFinite(parsedSamples) && parsedSamples > 0) {
      config.tolerance.mc_samples = Math.floor(parsedSamples);
    }

    const result = await runScript('tolerance_analysis.py', config, { timeout: 60_000 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

import { Router } from 'express';
import { resolve } from 'node:path';

const router = Router();

/**
 * POST /api/tolerance - Run tolerance analysis
 * Input: { configPath: string, monteCarlo?: boolean }
 */
router.post('/tolerance', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);
  const { loadConfig } = await import(`${freecadRoot}/lib/config-loader.js`);

  const { configPath, monteCarlo = true } = req.body;
  if (!configPath) return res.status(400).json({ error: 'configPath required' });

  try {
    const config = await loadConfig(resolve(freecadRoot, configPath));
    if (!config.tolerance) {
      return res.status(400).json({ error: 'No tolerance section in config' });
    }

    // Add monte-carlo flag
    if (monteCarlo) {
      config._monte_carlo = true;
    }

    const result = await runScript('tolerance_analysis.py', config, { timeout: 60_000 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

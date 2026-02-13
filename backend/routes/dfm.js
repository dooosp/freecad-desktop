import { Router } from 'express';
import { resolve } from 'node:path';

const router = Router();

/**
 * POST /api/dfm - Run DFM analysis
 * Input: { configPath: string, process: "machining"|"casting"|"sheet_metal"|"3d_printing" }
 */
router.post('/dfm', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);
  const { loadConfig } = await import(`${freecadRoot}/lib/config-loader.js`);

  const { configPath, process: mfgProcess = 'machining' } = req.body;
  if (!configPath) return res.status(400).json({ error: 'configPath required' });

  try {
    const config = await loadConfig(resolve(freecadRoot, configPath));
    if (!config.manufacturing) config.manufacturing = {};
    config.manufacturing.process = mfgProcess;

    const result = await runScript('dfm_checker.py', config, { timeout: 60_000 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

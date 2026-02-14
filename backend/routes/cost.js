import { Router } from 'express';
import { resolve } from 'node:path';

const router = Router();

/**
 * POST /api/cost - Run cost estimation
 * Input: { configPath: string, process?: string, material?: string, batchSize?: number }
 */
router.post('/cost', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);
  const { loadConfig } = await import(`${freecadRoot}/lib/config-loader.js`);

  const {
    configPath,
    process: mfgProcess = 'machining',
    material = 'SS304',
    batchSize = 1,
    dfmResult = null,
    profileName = null,
  } = req.body;
  if (!configPath) return res.status(400).json({ error: 'configPath required' });

  try {
    const config = await loadConfig(resolve(freecadRoot, configPath));
    const costInput = {
      ...config,
      dfm_result: dfmResult,
      material,
      process: mfgProcess,
      batch_size: batchSize,
    };

    // Load and inject shop profile if specified
    if (profileName) {
      try {
        const { readFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const profilePath = join(freecadRoot, 'configs', 'profiles', `${profileName}.json`);
        const profileContent = await readFile(profilePath, 'utf8');
        costInput.shop_profile = JSON.parse(profileContent);
      } catch {
        // Profile load failed, continue without it
      }
    }

    const result = await runScript('cost_estimator.py', costInput, { timeout: 60_000 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

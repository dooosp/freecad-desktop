import { resolve } from 'node:path';
import { createHttpError } from '../../lib/async-handler.js';
import { loadShopProfile } from '../../lib/profile-loader.js';

export async function compareProfilesHandler(req, res) {
  const { freecadRoot, runScript, loadConfig } = req.app.locals;
  const { configPath, profileA, profileB, options = {} } = req.body;
  if (!configPath) throw createHttpError(400, 'configPath required');
  if (!profileA || !profileB) throw createHttpError(400, 'profileA and profileB required');

  const config = await loadConfig(resolve(freecadRoot, configPath));

  async function runWithProfile(profileName) {
    const profile = await loadShopProfile(freecadRoot, profileName, { silent: false });
    const dfmConfig = { ...config };
    if (!dfmConfig.manufacturing) dfmConfig.manufacturing = {};
    if (options.process) dfmConfig.manufacturing.process = options.process;
    if (options.material) dfmConfig.manufacturing.material = options.material;
    if (!dfmConfig.manufacturing.process) dfmConfig.manufacturing.process = 'machining';
    if (profile) dfmConfig.shop_profile = profile;

    const dfm = await runScript('dfm_checker.py', dfmConfig, { timeout: 60_000 });

    const costInput = {
      ...config,
      dfm_result: dfm || null,
      material: options.material || config.manufacturing?.material || 'SS304',
      process: options.process || config.manufacturing?.process || 'machining',
      batch_size: options.batch || 1,
    };
    if (profile) costInput.shop_profile = profile;

    const cost = await runScript('cost_estimator.py', costInput, { timeout: 60_000 });
    return { name: profileName, dfm, cost };
  }

  const [resultA, resultB] = await Promise.all([
    runWithProfile(profileA),
    runWithProfile(profileB),
  ]);

  res.json({ profileA: resultA, profileB: resultB });
}

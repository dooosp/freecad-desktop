import { resolve } from 'node:path';
import { createHttpError } from '../../lib/async-handler.js';
import { loadShopProfile } from '../../lib/profile-loader.js';

export function createCostHandler({ loadShopProfileFn = loadShopProfile } = {}) {
  return async function costHandler(req, res) {
    const { freecadRoot, runScript, loadConfig } = req.app.locals;
    const {
      configPath,
      process: mfgProcess = 'machining',
      material = 'SS304',
      batchSize = 1,
      dfmResult = null,
      profileName = null,
    } = req.body;

    if (!configPath) throw createHttpError(400, 'configPath required');

    const config = await loadConfig(resolve(freecadRoot, configPath));
    const costInput = {
      ...config,
      dfm_result: dfmResult,
      material,
      process: mfgProcess,
      batch_size: batchSize,
      standard: req.body.standard || 'KS',
    };

    const shopProfile = await loadShopProfileFn(freecadRoot, profileName);
    if (shopProfile) {
      costInput.shop_profile = shopProfile;
    }

    const result = await runScript('cost_estimator.py', costInput, { timeout: 60_000 });
    res.json(result);
  };
}

export const runCostHandler = createCostHandler();

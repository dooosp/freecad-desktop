import { Router } from 'express';
import { resolve } from 'node:path';
import { asyncHandler, createHttpError } from '../lib/async-handler.js';
import { loadShopProfile } from '../lib/profile-loader.js';

const router = Router();

/**
 * POST /api/dfm - Run DFM analysis
 * Input: { configPath: string, process: "machining"|"casting"|"sheet_metal"|"3d_printing" }
 */
router.post('/dfm', asyncHandler(async (req, res) => {
  const { freecadRoot, runScript, loadConfig } = req.app.locals;
  const { configPath, process: mfgProcess = 'machining', profileName = null } = req.body;
  if (!configPath) throw createHttpError(400, 'configPath required');

  const config = await loadConfig(resolve(freecadRoot, configPath));
  config.standard = req.body.standard || 'KS';
  if (!config.manufacturing) config.manufacturing = {};
  config.manufacturing.process = mfgProcess;

  const shopProfile = await loadShopProfile(freecadRoot, profileName);
  if (shopProfile) {
    config.shop_profile = shopProfile;
  }

  const result = await runScript('dfm_checker.py', config, { timeout: 60_000 });
  res.json(result);
}));

export default router;

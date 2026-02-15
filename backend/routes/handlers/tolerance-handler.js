import { resolve } from 'node:path';
import { createHttpError } from '../../lib/async-handler.js';

export async function runToleranceHandler(req, res) {
  const { freecadRoot, runScript, loadConfig } = req.app.locals;
  const { configPath, monteCarlo = true, mcSamples } = req.body;

  if (!configPath) throw createHttpError(400, 'configPath required');

  const config = await loadConfig(resolve(freecadRoot, configPath));
  config.standard = req.body.standard || 'KS';
  const hasAssembly = Boolean(config.assembly);
  const hasParts = Array.isArray(config.parts) && config.parts.length > 0;
  if (!hasAssembly || !hasParts) {
    throw createHttpError(
      400,
      'Tolerance analysis requires an assembly config with [assembly] and [[parts]] sections.'
    );
  }

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
}

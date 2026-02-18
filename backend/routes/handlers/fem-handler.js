import { resolve } from 'node:path';
import { createHttpError } from '../../lib/async-handler.js';

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function convertKeysToSnake(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToSnake);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[camelToSnake(k)] = convertKeysToSnake(v);
  }
  return out;
}

export function createFemHandler() {
  return async function femHandler(req, res) {
    const { freecadRoot, runScript, loadConfig } = req.app.locals;
    const { configPath, fem } = req.body;

    if (!configPath) throw createHttpError(400, 'configPath required');
    if (!fem) throw createHttpError(400, 'fem config required');

    const config = await loadConfig(resolve(freecadRoot, configPath));
    config.fem = convertKeysToSnake(fem);

    const result = await runScript('fem_analysis.py', config, { timeout: 300_000 });
    res.json(result);
  };
}

export const runFemHandler = createFemHandler();

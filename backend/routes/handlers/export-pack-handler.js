import { resolve, sep } from 'node:path';
import { buildPack } from '../../lib/pack-builder.js';

function isPathInside(baseDir, targetPath) {
  const base = resolve(baseDir);
  const target = resolve(targetPath);
  return target === base || target.startsWith(`${base}${sep}`);
}

export async function exportPackHandler(req, res) {
  const freecadRoot = req.app.locals.freecadRoot;
  const { loadConfig } = req.app.locals;
  const {
    configPath,
    profileName = '',
    templateName = '',
    partName = '',
    revision = 'Rev.A',
    organization = '',
    include = {},
    analysisResults = {},
    reportPdfBase64 = null,
  } = req.body;

  if (!configPath) return res.status(400).json({ error: 'configPath required' });

  const absConfigPath = resolve(freecadRoot, configPath);
  if (!isPathInside(freecadRoot, absConfigPath)) {
    return res.status(403).json({ error: 'configPath must be inside project root' });
  }

  try {
    const config = await loadConfig(absConfigPath);

    const packOptions = {
      freecadRoot,
      configPath,
      config,
      results: analysisResults,
      profileName,
      templateName,
      partName,
      revision,
      organization,
      include,
      reportPdfBase64,
    };

    const result = await buildPack(packOptions);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

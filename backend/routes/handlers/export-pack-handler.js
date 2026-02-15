import { resolve } from 'node:path';
import { buildPack } from '../../lib/pack-builder.js';

export async function exportPackHandler(req, res) {
  const freecadRoot = req.app.locals.freecadRoot;
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

  try {
    const { loadConfig } = await import(`${freecadRoot}/lib/config-loader.js`);
    const config = await loadConfig(resolve(freecadRoot, configPath));

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

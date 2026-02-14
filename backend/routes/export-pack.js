import { Router } from 'express';
import { resolve } from 'node:path';
import { buildPack } from '../lib/pack-builder.js';

const router = Router();

/**
 * POST /api/export-pack - Generate deliverable pack (ZIP)
 * Input: {
 *   configPath: string,
 *   profileName?: string,
 *   templateName?: string,
 *   revision?: string,
 *   organization?: string,
 *   include: {
 *     step?: boolean,
 *     svg?: boolean,
 *     drawing_pdf?: boolean,
 *     dfm?: boolean,
 *     tolerance?: boolean,
 *     cost?: boolean,
 *     report?: boolean,
 *     bom?: boolean,
 *   },
 *   analysisResults?: object, // From /analyze endpoint
 *   reportPdfBase64?: string,  // From /report endpoint
 * }
 * Output: { zipBase64: string, filename: string }
 */
router.post('/', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { loadConfig } = await import(`${freecadRoot}/lib/config-loader.js`);

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
});

export default router;

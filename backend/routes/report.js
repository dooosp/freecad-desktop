import { Router } from 'express';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const router = Router();

/**
 * POST /api/report - Generate integrated PDF report
 * Input: { configPath: string, includeDrawing, includeDfm, includeTolerance, includeCost }
 */
router.post('/report', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);
  const { loadConfig } = await import(`${freecadRoot}/lib/config-loader.js`);

  const {
    configPath,
    includeDrawing = true,
    includeDfm = true,
    includeTolerance = true,
    includeCost = true,
    analysisResults = null,
  } = req.body;

  if (!configPath) return res.status(400).json({ error: 'configPath required' });

  try {
    const config = await loadConfig(resolve(freecadRoot, configPath));

    // Ensure export directory points to freecad-automation/output
    const outputDir = resolve(freecadRoot, 'output');
    const reportInput = {
      ...config,
      export: { ...config.export, directory: outputDir },
      _report_options: {
        include_drawing: includeDrawing,
        include_dfm: includeDfm,
        include_tolerance: includeTolerance,
        include_cost: includeCost,
      },
      _analysis_results: analysisResults,
    };

    const result = await runScript('engineering_report.py', reportInput, { timeout: 180_000 });

    // Read PDF — result.path is relative or absolute Windows path
    const pdfRelPath = result.pdf_path || result.path;
    if (pdfRelPath) {
      try {
        const { toWSL } = await import(`${freecadRoot}/lib/paths.js`);
        const pdfWSL = toWSL(pdfRelPath);
        const pdfBuffer = await readFile(pdfWSL);
        result.pdfBase64 = pdfBuffer.toString('base64');
      } catch { /* PDF read optional */ }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

import { Router } from 'express';
import { resolve, basename, extname, relative } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import multer from 'multer';
import { analyzeStep, generateConfigFromAnalysis } from '../lib/step-analyzer.js';

const router = Router();
const upload = multer({ dest: '/tmp/freecad-uploads' });

/**
 * POST /api/step/import
 * Dual mode: Tauri sends { filePath }, Web sends FormData with file.
 */
router.post('/step/import', upload.single('file'), async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;

  try {
    let stepFilePath;
    let stepName;

    if (req.file) {
      // Web mode: uploaded file
      stepName = basename(req.file.originalname, extname(req.file.originalname));
      const importsDir = resolve(freecadRoot, 'output', 'imports');
      await mkdir(importsDir, { recursive: true });
      stepFilePath = resolve(importsDir, req.file.originalname);
      const { readFile } = await import('node:fs/promises');
      const data = await readFile(req.file.path);
      await writeFile(stepFilePath, data);
    } else if (req.body?.filePath) {
      // Tauri mode: local file path
      stepFilePath = resolve(req.body.filePath);
      stepName = basename(stepFilePath, extname(stepFilePath));
    } else {
      return res.status(400).json({ error: 'No STEP file provided' });
    }

    // Analyze STEP features
    const analysis = await analyzeStep(freecadRoot, stepFilePath);

    // Generate TOML config
    const tomlString = generateConfigFromAnalysis(analysis);

    // Save config
    const configsDir = resolve(freecadRoot, 'configs', 'imports');
    await mkdir(configsDir, { recursive: true });
    const configPath = resolve(configsDir, `${stepName}.toml`);
    await writeFile(configPath, tomlString, 'utf-8');

    // Return relative config path for frontend use
    const relConfigPath = `configs/imports/${stepName}.toml`;

    res.json({
      success: true,
      analysis,
      tomlString,
      configPath: relConfigPath,
      stepFile: stepFilePath,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/step/save-config
 * Save user-edited TOML back to disk.
 */
router.post('/step/save-config', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { configPath, tomlString } = req.body;

  if (!configPath || !tomlString) {
    return res.status(400).json({ error: 'configPath and tomlString required' });
  }

  // Path traversal defense
  const absPath = resolve(freecadRoot, configPath);
  const rel = relative(freecadRoot, absPath);
  if (rel.startsWith('..') || resolve(rel) === rel) {
    return res.status(403).json({ error: 'Invalid config path' });
  }

  try {
    await writeFile(absPath, tomlString, 'utf-8');
    res.json({ success: true, configPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

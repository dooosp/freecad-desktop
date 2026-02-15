import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename, extname, relative, isAbsolute } from 'node:path';
import { analyzeStep, generateConfigFromAnalysis } from '../../lib/step-analyzer.js';

export function createStepImportHandler({
  analyzeStepFn = analyzeStep,
  generateConfigFromAnalysisFn = generateConfigFromAnalysis,
  readFileFn = readFile,
  writeFileFn = writeFile,
  mkdirFn = mkdir,
} = {}) {
  return async function stepImportHandler(req, res) {
    const freecadRoot = req.app.locals.freecadRoot;

    try {
      let stepFilePath;
      let stepName;

      if (req.file) {
        stepName = basename(req.file.originalname, extname(req.file.originalname));
        const importsDir = resolve(freecadRoot, 'output', 'imports');
        await mkdirFn(importsDir, { recursive: true });
        stepFilePath = resolve(importsDir, req.file.originalname);
        const uploaded = await readFileFn(req.file.path);
        await writeFileFn(stepFilePath, uploaded);
      } else if (req.body?.filePath) {
        stepFilePath = resolve(req.body.filePath);
        stepName = basename(stepFilePath, extname(stepFilePath));
      } else {
        return res.status(400).json({ error: 'No STEP file provided' });
      }

      const analysis = await analyzeStepFn(freecadRoot, stepFilePath);
      const tomlString = generateConfigFromAnalysisFn(analysis);

      const configsDir = resolve(freecadRoot, 'configs', 'imports');
      await mkdirFn(configsDir, { recursive: true });
      const configPath = resolve(configsDir, `${stepName}.toml`);
      await writeFileFn(configPath, tomlString, 'utf-8');

      return res.json({
        success: true,
        analysis,
        tomlString,
        configPath: `configs/imports/${stepName}.toml`,
        stepFile: stepFilePath,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  };
}

export async function saveStepConfigHandler(req, res) {
  const freecadRoot = req.app.locals.freecadRoot;
  const { configPath, tomlString } = req.body;

  if (!configPath || !tomlString) {
    return res.status(400).json({ error: 'configPath and tomlString required' });
  }

  const absPath = resolve(freecadRoot, configPath);
  const rel = relative(freecadRoot, absPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return res.status(403).json({ error: 'Invalid config path' });
  }

  try {
    await writeFile(absPath, tomlString, 'utf-8');
    return res.json({ success: true, configPath });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export const runStepImportHandler = createStepImportHandler();

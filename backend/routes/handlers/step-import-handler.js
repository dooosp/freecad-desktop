import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { resolve, basename, extname, sep } from 'node:path';
import { analyzeStep, generateConfigFromAnalysis } from '../../lib/step-analyzer.js';

function isPathInside(baseDir, targetPath) {
  const base = resolve(baseDir);
  const target = resolve(targetPath);
  return target === base || target.startsWith(`${base}${sep}`);
}

export function createStepImportHandler({
  analyzeStepFn = analyzeStep,
  generateConfigFromAnalysisFn = generateConfigFromAnalysis,
  readFileFn = readFile,
  writeFileFn = writeFile,
  mkdirFn = mkdir,
} = {}) {
  return async function stepImportHandler(req, res) {
    const freecadRoot = req.app.locals.freecadRoot;
    const tempUploadPath = req.file?.path;

    try {
      let stepFilePath;
      let stepName;

      if (req.file) {
        const originalName = basename(req.file.originalname || 'uploaded.step');
        stepName = basename(originalName, extname(originalName));
        const importsDir = resolve(freecadRoot, 'output', 'imports');
        await mkdirFn(importsDir, { recursive: true });
        stepFilePath = resolve(importsDir, originalName);
        if (!isPathInside(importsDir, stepFilePath)) {
          return res.status(403).json({ error: 'Invalid STEP upload path' });
        }
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
    } finally {
      if (tempUploadPath) {
        await unlink(tempUploadPath).catch(() => {});
      }
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
  if (!isPathInside(freecadRoot, absPath)) {
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

import { resolve, join } from 'node:path';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { createHttpError } from '../../lib/async-handler.js';

export function createDesignHandler({ designFromTextFn, reviewTomlFn, validateTomlFn } = {}) {
  return async function designHandler(req, res) {
    const { freecadRoot, runScript, loadConfig } = req.app.locals;
    const { mode } = req.body;

    if (!mode) throw createHttpError(400, 'mode required (design|review|build)');

    if (mode === 'design') {
      const { description } = req.body;
      if (!description) throw createHttpError(400, 'description required for design mode');

      const designFn = designFromTextFn
        || (await import(`${freecadRoot}/scripts/design-reviewer.js`)).designFromText;
      const result = await designFn(description);
      return res.json(result);
    }

    if (mode === 'review') {
      const { toml } = req.body;
      if (!toml) throw createHttpError(400, 'toml required for review mode');

      const reviewFn = reviewTomlFn
        || (await import(`${freecadRoot}/scripts/design-reviewer.js`)).reviewToml;
      const validateFn = validateTomlFn
        || (await import(`${freecadRoot}/scripts/design-reviewer.js`)).validateTomlStructure;

      const tmpDir = join(freecadRoot, 'configs', 'generated');
      await mkdir(tmpDir, { recursive: true });
      const tmpPath = join(tmpDir, `review_${Date.now()}.toml`);
      await writeFile(tmpPath, toml, 'utf8');

      try {
        const validation = validateFn(toml);
        const review = await reviewFn(tmpPath);
        return res.json({ ...review, validation });
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    }

    if (mode === 'build') {
      const { toml } = req.body;
      if (!toml) throw createHttpError(400, 'toml required for build mode');

      const outDir = join(freecadRoot, 'configs', 'generated');
      await mkdir(outDir, { recursive: true });
      const configPath = join(outDir, `design_${Date.now()}.toml`);
      await writeFile(configPath, toml, 'utf8');

      const config = await loadConfig(configPath);
      const result = await runScript('create_model.py', config, { timeout: 120_000 });
      return res.json({ ...result, configPath: configPath.replace(freecadRoot + '/', '') });
    }

    throw createHttpError(400, `unknown mode: ${mode}`);
  };
}

export const runDesignHandler = createDesignHandler();

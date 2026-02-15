import { Router } from 'express';
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { asyncHandler, createHttpError } from '../lib/async-handler.js';
import { loadShopProfile } from '../lib/profile-loader.js';

const router = Router();

/**
 * POST /api/profiles/compare - Compare two profiles (DFM + Cost only, skip model/drawing)
 * Body: { configPath, profileA, profileB, options: { process, material, batch } }
 */
export async function compareProfilesHandler(req, res) {
  const { freecadRoot, runScript, loadConfig } = req.app.locals;
  const { configPath, profileA, profileB, options = {} } = req.body;
  if (!configPath) throw createHttpError(400, 'configPath required');
  if (!profileA || !profileB) throw createHttpError(400, 'profileA and profileB required');

  const config = await loadConfig(resolve(freecadRoot, configPath));

  async function runWithProfile(profileName) {
    const profile = await loadShopProfile(freecadRoot, profileName, { silent: false });
    const dfmConfig = { ...config };
    if (!dfmConfig.manufacturing) dfmConfig.manufacturing = {};
    if (options.process) dfmConfig.manufacturing.process = options.process;
    if (options.material) dfmConfig.manufacturing.material = options.material;
    if (!dfmConfig.manufacturing.process) dfmConfig.manufacturing.process = 'machining';
    if (profile) dfmConfig.shop_profile = profile;

    const dfm = await runScript('dfm_checker.py', dfmConfig, { timeout: 60_000 });

    const costInput = {
      ...config,
      dfm_result: dfm || null,
      material: options.material || config.manufacturing?.material || 'SS304',
      process: options.process || config.manufacturing?.process || 'machining',
      batch_size: options.batch || 1,
    };
    if (profile) costInput.shop_profile = profile;

    const cost = await runScript('cost_estimator.py', costInput, { timeout: 60_000 });
    return { name: profileName, dfm, cost };
  }

  const [resultA, resultB] = await Promise.all([
    runWithProfile(profileA),
    runWithProfile(profileB),
  ]);

  res.json({ profileA: resultA, profileB: resultB });
}

router.post('/compare', asyncHandler(compareProfilesHandler));

/**
 * GET /api/profiles - List all shop profiles
 */
router.get('/', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const profilesDir = join(freecadRoot, 'configs', 'profiles');

  try {
    const files = await readdir(profilesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const profiles = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const content = await readFile(join(profilesDir, file), 'utf8');
          const data = JSON.parse(content);
          return {
            name: file.replace('.json', ''),
            description: data.description || '',
            label: data.label || file.replace('.json', ''),
          };
        } catch {
          return null;
        }
      })
    );

    res.json(profiles.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/profiles/:name - Get single profile
 */
router.get('/:name', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const profilePath = join(freecadRoot, 'configs', 'profiles', `${req.params.name}.json`);

  try {
    const content = await readFile(profilePath, 'utf8');
    const profile = JSON.parse(content);
    res.json({ name: req.params.name, ...profile });
  } catch (err) {
    res.status(404).json({ error: 'Profile not found' });
  }
});

/**
 * POST /api/profiles - Create new profile
 * Body: { name, label, description, hourlyRate, setupCost, ... }
 */
router.post('/', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { name, ...profileData } = req.body;

  if (!name) return res.status(400).json({ error: 'name required' });
  if (name === '_default') return res.status(400).json({ error: 'name _default is reserved' });
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid name format (use alphanumeric, _, -)' });
  }

  const profilePath = join(freecadRoot, 'configs', 'profiles', `${name}.json`);

  try {
    try {
      await readFile(profilePath, 'utf8');
      return res.status(409).json({ error: 'Profile already exists' });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    const now = new Date().toISOString();
    const profile = {
      name,
      ...profileData,
      created: now,
      updated: now,
    };

    await writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf8');
    res.json({ success: true, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/profiles/:name - Update profile
 */
router.put('/:name', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const profilePath = join(freecadRoot, 'configs', 'profiles', `${req.params.name}.json`);

  try {
    const existing = await readFile(profilePath, 'utf8');
    const current = JSON.parse(existing);

    const updated = {
      ...current,
      ...req.body,
      name: req.params.name,
      created: current.created, // preserve original
      updated: new Date().toISOString(),
    };

    await writeFile(profilePath, JSON.stringify(updated, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/profiles/:name - Delete profile (prevent _default deletion)
 */
router.delete('/:name', async (req, res) => {
  if (req.params.name === '_default') {
    return res.status(400).json({ error: 'Cannot delete default profile' });
  }

  const freecadRoot = req.app.locals.freecadRoot;
  const profilePath = join(freecadRoot, 'configs', 'profiles', `${req.params.name}.json`);

  try {
    await unlink(profilePath);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;

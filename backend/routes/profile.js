import { Router } from 'express';
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { asyncHandler } from '../lib/async-handler.js';
import { compareProfilesHandler } from './handlers/profile-compare.js';
export { compareProfilesHandler } from './handlers/profile-compare.js';

const router = Router();

/**
 * POST /api/profiles/compare - Compare two profiles (DFM + Cost only, skip model/drawing)
 * Body: { configPath, profileA, profileB, options: { process, material, batch } }
 */
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
          let data;
          try {
            data = JSON.parse(content);
          } catch (err) {
            console.error(`[profiles] Invalid JSON in ${file}: ${err.message}`);
            return null;
          }
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
    let profile;
    try {
      profile = JSON.parse(content);
    } catch (err) {
      return res.status(500).json({ error: `Invalid profile JSON: ${err.message}` });
    }
    res.json({ name: req.params.name, ...profile });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.status(500).json({ error: err.message });
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
  const RESERVED_NAMES = ['_default', '__proto__', 'constructor', 'prototype'];
  if (RESERVED_NAMES.includes(name)) return res.status(400).json({ error: `name '${name}' is reserved` });
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
    let current;
    try {
      current = JSON.parse(existing);
    } catch (err) {
      return res.status(500).json({ error: `Invalid profile JSON: ${err.message}` });
    }

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

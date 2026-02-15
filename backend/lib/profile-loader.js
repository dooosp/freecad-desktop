import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Load shop profile JSON by name.
 * Returns null for empty/_default names.
 *
 * @param {string} freecadRoot
 * @param {string|null|undefined} profileName
 * @param {{ silent?: boolean }} [options]
 * @returns {Promise<object|null>}
 */
export async function loadShopProfile(freecadRoot, profileName, options = {}) {
  const { silent = true } = options;
  if (!profileName || profileName === '_default') return null;

  try {
    const profilePath = join(freecadRoot, 'configs', 'profiles', `${profileName}.json`);
    const content = await readFile(profilePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (silent) return null;
    throw err;
  }
}

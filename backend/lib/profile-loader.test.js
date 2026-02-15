// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadShopProfile } from './profile-loader.js';

const tempRoots = [];

async function createFreecadRoot() {
  const root = await mkdtemp(join(tmpdir(), 'profile-loader-test-'));
  tempRoots.push(root);
  await mkdir(join(root, 'configs', 'profiles'), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.allSettled(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('loadShopProfile', () => {
  it('returns null for empty or _default profile names', async () => {
    const root = await createFreecadRoot();
    await expect(loadShopProfile(root, '')).resolves.toBeNull();
    await expect(loadShopProfile(root, null)).resolves.toBeNull();
    await expect(loadShopProfile(root, '_default')).resolves.toBeNull();
  });

  it('loads and parses profile json when file exists', async () => {
    const root = await createFreecadRoot();
    const profile = { machine_limits: { max_dia: 120 }, rates: { cnc_min: 700 } };
    await writeFile(
      join(root, 'configs', 'profiles', 'sample_precision.json'),
      JSON.stringify(profile),
      'utf8',
    );

    const loaded = await loadShopProfile(root, 'sample_precision');
    expect(loaded).toEqual(profile);
  });

  it('returns null for missing profile when silent=true', async () => {
    const root = await createFreecadRoot();
    await expect(loadShopProfile(root, 'missing_profile')).resolves.toBeNull();
  });

  it('throws for missing profile when silent=false', async () => {
    const root = await createFreecadRoot();
    await expect(loadShopProfile(root, 'missing_profile', { silent: false })).rejects.toThrow();
  });
});

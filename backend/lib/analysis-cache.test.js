// @vitest-environment node
import { mkdtemp, mkdir, open, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AnalysisCache } from './analysis-cache.js';

const tempRoots = [];

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), 'analysis-cache-test-'));
  tempRoots.push(root);
  return root;
}

async function createSparseFile(path, sizeBytes) {
  const fh = await open(path, 'w');
  await fh.truncate(sizeBytes);
  await fh.close();
}

afterEach(async () => {
  await Promise.allSettled(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('AnalysisCache', () => {
  it('builds deterministic cache key and merges runtime options', async () => {
    const root = await createRoot();
    const cache = new AnalysisCache(root);
    const configA = {
      operations: [{ kind: 'cut' }],
      shapes: [{ type: 'box', width: 10 }],
      manufacturing: { process: 'machining', material: 'SS304' },
    };
    const configB = {
      manufacturing: { material: 'SS304', process: 'machining' },
      shapes: [{ width: 10, type: 'box' }],
      operations: [{ kind: 'cut' }],
    };

    const keyA = cache.getCacheKey('dfm', configA, { process: 'casting', material: 'A36', shopProfile: 'shop_a' });
    const keyB = cache.getCacheKey('dfm', configB, { process: 'casting', material: 'A36', shopProfile: 'shop_a' });
    expect(keyA).toBe(keyB);
    expect(keyA.startsWith('dfm-')).toBe(true);

    const unknown = cache.getCacheKey('unknown-stage', configA);
    expect(unknown).toBeNull();
  });

  it('stores and reads cache entries', async () => {
    const root = await createRoot();
    const cache = new AnalysisCache(root);
    const key = cache.getCacheKey('create', { shapes: [{ type: 'cylinder' }] }, {});
    const result = { model_path: 'output/a.step' };

    const miss = await cache.checkCache(key);
    expect(miss).toEqual({ hit: false });

    await cache.storeCache(key, result, 'create');
    const hit = await cache.checkCache(key);
    expect(hit.hit).toBe(true);
    expect(hit.entry.stage).toBe('create');
    expect(hit.entry.result).toEqual(result);
    expect(typeof hit.entry.timestamp).toBe('number');
  });

  it('returns cache miss for empty key and invalid json entries', async () => {
    const root = await createRoot();
    const cache = new AnalysisCache(root);
    await mkdir(cache.cacheDir, { recursive: true });

    expect(await cache.checkCache(null)).toEqual({ hit: false });

    const badFile = join(cache.cacheDir, 'create-invalid.json');
    await createSparseFile(badFile, 8);
    const raw = await readFile(badFile);
    if (raw.length === 8) {
      // overwrite with malformed JSON while preserving file existence
      await rm(badFile, { force: true });
      await createSparseFile(badFile, 0);
    }
    await rm(badFile, { force: true });
    await mkdir(cache.cacheDir, { recursive: true });
    await createSparseFile(join(cache.cacheDir, 'create-invalid.json'), 1);
    const miss = await cache.checkCache('create-invalid');
    expect(miss).toEqual({ hit: false });
  });

  it('reports stats and clears by stage filter', async () => {
    const root = await createRoot();
    const cache = new AnalysisCache(root);
    const createKey = cache.getCacheKey('create', { shapes: [{ type: 'box' }] });
    const dfmKey = cache.getCacheKey('dfm', { shapes: [{ type: 'box' }] });

    await cache.storeCache(createKey, { ok: 1 }, 'create');
    await cache.storeCache(dfmKey, { ok: 2 }, 'dfm');

    const stats = await cache.getCacheStats();
    expect(stats.entries).toBeGreaterThanOrEqual(2);
    expect(stats.totalSizeBytes).toBeGreaterThan(0);
    expect(stats.byStage.create).toBeGreaterThanOrEqual(1);
    expect(stats.byStage.dfm).toBeGreaterThanOrEqual(1);

    const clearCreate = await cache.clearCache('create');
    expect(clearCreate.deleted).toBeGreaterThanOrEqual(1);

    const afterCreateClear = await cache.getCacheStats();
    expect(afterCreateClear.byStage.create || 0).toBe(0);
    expect(afterCreateClear.byStage.dfm).toBeGreaterThanOrEqual(1);

    const clearAll = await cache.clearCache();
    expect(clearAll.deleted).toBeGreaterThanOrEqual(1);
    const afterAllClear = await cache.getCacheStats();
    expect(afterAllClear.entries).toBe(0);
  });

  it('evicts oldest entries when cache exceeds size cap', async () => {
    const root = await createRoot();
    const cache = new AnalysisCache(root);
    await mkdir(cache.cacheDir, { recursive: true });

    const oldFile = join(cache.cacheDir, 'create-old.json');
    const midFile = join(cache.cacheDir, 'dfm-mid.json');
    const newFile = join(cache.cacheDir, 'cost-new.json');

    await createSparseFile(oldFile, 220 * 1024 * 1024);
    await createSparseFile(midFile, 220 * 1024 * 1024);
    await createSparseFile(newFile, 220 * 1024 * 1024);

    const now = Date.now() / 1000;
    await utimes(oldFile, now - 30, now - 30);
    await utimes(midFile, now - 20, now - 20);
    await utimes(newFile, now - 10, now - 10);

    await cache._evictIfNeeded();

    const stats = await cache.getCacheStats();
    expect(stats.totalSizeBytes).toBeLessThanOrEqual(500 * 1024 * 1024);
    // At least one old entry should be evicted.
    expect(stats.entries).toBeLessThan(3);
  });

  it('handles stats/clear failures gracefully', async () => {
    const root = await createRoot();
    const cache = new AnalysisCache(root);

    // Make cacheDir point to an existing file so mkdir/readdir fail.
    const filePath = join(root, 'not-a-dir');
    await createSparseFile(filePath, 4);
    cache.cacheDir = filePath;

    const stats = await cache.getCacheStats();
    expect(stats).toEqual({ entries: 0, totalSizeBytes: 0, byStage: {} });

    const cleared = await cache.clearCache();
    expect(cleared).toEqual({ deleted: 0 });
  });
});

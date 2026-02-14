import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_CACHE_BYTES = 500 * 1024 * 1024; // 500 MB

// Fields used to compute each stage's cache key
const STAGE_FIELDS = {
  create: (cfg) => pick(cfg, ['shapes', 'operations', 'parts', 'assembly', 'export']),
  drawing: (cfg) => pick(cfg, ['shapes', 'operations', 'parts', 'assembly', 'export', 'drawing', 'drawing_plan', 'tolerance', 'dxfExport']),
  dfm: (cfg) => pick(cfg, ['shapes', 'operations', 'manufacturing', 'shop_profile']),
  cost: (cfg) => pick(cfg, ['shapes', 'operations', 'material', 'process', 'batch_size', 'shop_profile', 'dfm_score']),
  tolerance: (cfg) => pick(cfg, ['parts', 'assembly', 'tolerance']),
};

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

function stableStringify(obj) {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

function hash(data) {
  return createHash('sha256')
    .update(stableStringify(data))
    .digest('hex')
    .slice(0, 16);
}

export class AnalysisCache {
  constructor(freecadRoot) {
    this.cacheDir = join(freecadRoot, '.cache');
  }

  async _ensureDir() {
    await mkdir(this.cacheDir, { recursive: true });
  }

  /**
   * Build a cache key string for a given stage and config/options.
   */
  getCacheKey(stage, config, options = {}) {
    const extractor = STAGE_FIELDS[stage];
    if (!extractor) return null;

    // Merge runtime options into a flat object for hashing
    const merged = { ...config };
    // Merge material/process into manufacturing (used by dfm stage extractor)
    if (options.process || options.material) {
      merged.manufacturing = { ...(merged.manufacturing || {}) };
      if (options.process) merged.manufacturing.process = options.process;
      if (options.material) merged.manufacturing.material = options.material;
    }
    if (options.process) merged.process = options.process;
    if (options.material) merged.material = options.material;
    if (options.batch) merged.batch_size = options.batch;
    if (options.dxfExport != null) merged.dxfExport = options.dxfExport;
    if (options.shopProfile) merged.shop_profile = options.shopProfile;
    if (options.dfm_score != null) merged.dfm_score = options.dfm_score;
    if (options.monteCarlo != null) merged.monteCarlo = options.monteCarlo;
    if (options.mcSamples != null) merged.mcSamples = options.mcSamples;

    const fields = extractor(merged);
    const h = hash(fields);
    return `${stage}-${h}`;
  }

  /**
   * Check if a cache entry exists and is valid.
   */
  async checkCache(key) {
    if (!key) return { hit: false };
    try {
      const filePath = join(this.cacheDir, `${key}.json`);
      const raw = await readFile(filePath, 'utf8');
      const entry = JSON.parse(raw);
      return { hit: true, entry };
    } catch {
      return { hit: false };
    }
  }

  /**
   * Store a result in the cache.
   */
  async storeCache(key, result, stage) {
    if (!key) return;
    await this._ensureDir();
    const entry = { result, stage, timestamp: Date.now() };
    const filePath = join(this.cacheDir, `${key}.json`);
    await writeFile(filePath, JSON.stringify(entry));
    // Fire-and-forget eviction check
    this._evictIfNeeded().catch(() => {});
  }

  /**
   * Get cache statistics.
   */
  async getCacheStats() {
    try {
      await this._ensureDir();
      const files = await readdir(this.cacheDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      let totalSizeBytes = 0;
      const byStage = {};

      for (const f of jsonFiles) {
        const s = await stat(join(this.cacheDir, f)).catch(() => null);
        if (!s) continue;
        totalSizeBytes += s.size;
        const stage = f.split('-')[0];
        byStage[stage] = (byStage[stage] || 0) + 1;
      }

      return { entries: jsonFiles.length, totalSizeBytes, byStage };
    } catch {
      return { entries: 0, totalSizeBytes: 0, byStage: {} };
    }
  }

  /**
   * Clear cache entries, optionally filtered by stage.
   */
  async clearCache(stage) {
    try {
      await this._ensureDir();
      const files = await readdir(this.cacheDir);
      const jsonFiles = files.filter(f => {
        if (!f.endsWith('.json')) return false;
        if (stage) return f.startsWith(`${stage}-`);
        return true;
      });

      let deleted = 0;
      for (const f of jsonFiles) {
        await unlink(join(this.cacheDir, f)).catch(() => {});
        deleted++;
      }
      return { deleted };
    } catch {
      return { deleted: 0 };
    }
  }

  /**
   * LRU eviction: remove oldest entries when total size exceeds limit.
   */
  async _evictIfNeeded() {
    const files = await readdir(this.cacheDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const entries = [];
    let totalSize = 0;

    for (const f of jsonFiles) {
      const fp = join(this.cacheDir, f);
      const s = await stat(fp).catch(() => null);
      if (!s) continue;
      totalSize += s.size;
      entries.push({ path: fp, size: s.size, mtime: s.mtimeMs });
    }

    if (totalSize <= MAX_CACHE_BYTES) return;

    // Sort oldest first
    entries.sort((a, b) => a.mtime - b.mtime);

    while (totalSize > MAX_CACHE_BYTES && entries.length > 0) {
      const oldest = entries.shift();
      await unlink(oldest.path).catch(() => {});
      totalSize -= oldest.size;
    }
  }
}

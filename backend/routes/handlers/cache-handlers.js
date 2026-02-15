import { AnalysisCache } from '../../lib/analysis-cache.js';

export async function cacheStatsHandler(req, res) {
  const cache = new AnalysisCache(req.app.locals.freecadRoot);
  const stats = await cache.getCacheStats();
  res.json(stats);
}

export async function clearCacheHandler(req, res) {
  const cache = new AnalysisCache(req.app.locals.freecadRoot);
  const stage = req.query?.stage || null;
  const result = await cache.clearCache(stage);
  res.json(result);
}

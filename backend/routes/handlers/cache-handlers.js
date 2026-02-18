import { AnalysisCache } from '../../lib/analysis-cache.js';

const ALLOWED_STAGES = ['dfm', 'cost', 'drawing', 'tolerance', 'fem'];

export async function cacheStatsHandler(req, res) {
  try {
    const cache = new AnalysisCache(req.app.locals.freecadRoot);
    const stats = await cache.getCacheStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function clearCacheHandler(req, res) {
  try {
    const stage = req.query?.stage || null;
    if (stage && !ALLOWED_STAGES.includes(stage)) {
      return res.status(400).json({ error: `Invalid stage. Allowed: ${ALLOWED_STAGES.join(', ')}` });
    }
    const cache = new AnalysisCache(req.app.locals.freecadRoot);
    const result = await cache.clearCache(stage);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

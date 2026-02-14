import { Router } from 'express';
import { AnalysisCache } from '../lib/analysis-cache.js';

const router = Router();

router.get('/stats', async (req, res) => {
  const cache = new AnalysisCache(req.app.locals.freecadRoot);
  const stats = await cache.getCacheStats();
  res.json(stats);
});

router.delete('/', async (req, res) => {
  const cache = new AnalysisCache(req.app.locals.freecadRoot);
  const stage = req.query.stage || null;
  const result = await cache.clearCache(stage);
  res.json(result);
});

export default router;

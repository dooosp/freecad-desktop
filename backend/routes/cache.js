import { Router } from 'express';
import { cacheStatsHandler, clearCacheHandler } from './handlers/cache-handlers.js';

const router = Router();

router.get('/stats', cacheStatsHandler);
router.delete('/', clearCacheHandler);

export { cacheStatsHandler, clearCacheHandler } from './handlers/cache-handlers.js';
export default router;

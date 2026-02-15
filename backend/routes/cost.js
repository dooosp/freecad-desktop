import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { runCostHandler } from './handlers/cost-handler.js';

const router = Router();

router.post('/cost', asyncHandler(runCostHandler));

export default router;

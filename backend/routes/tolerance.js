import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { runToleranceHandler } from './handlers/tolerance-handler.js';

const router = Router();

router.post('/tolerance', asyncHandler(runToleranceHandler));

export default router;

import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { runDfmHandler } from './handlers/dfm-handler.js';

const router = Router();

router.post('/dfm', asyncHandler(runDfmHandler));

export default router;

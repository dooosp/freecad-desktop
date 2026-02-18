import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { runFemHandler } from './handlers/fem-handler.js';

const router = Router();

router.post('/fem', asyncHandler(runFemHandler));

export default router;

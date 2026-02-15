import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { generateDrawingHandler } from './handlers/drawing-handler.js';

const router = Router();

router.post('/drawing', asyncHandler(generateDrawingHandler));

export default router;

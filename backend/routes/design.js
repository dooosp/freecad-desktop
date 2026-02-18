import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { runDesignHandler } from './handlers/design-handler.js';

const router = Router();

router.post('/design', asyncHandler(runDesignHandler));

export default router;

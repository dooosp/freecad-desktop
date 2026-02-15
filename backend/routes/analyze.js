import { Router } from 'express';
import { runAnalyzeHandler } from './handlers/analyze-handler.js';

const router = Router();

router.post('/analyze', runAnalyzeHandler);

export default router;

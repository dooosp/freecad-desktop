import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { generateReportHandler } from './handlers/report-handler.js';

const router = Router();

/**
 * POST /api/report - Generate integrated PDF report
 * Input: { configPath: string, includeDrawing, includeDfm, includeTolerance, includeCost }
 */
router.post('/report', asyncHandler(generateReportHandler));

export { generateReportHandler } from './handlers/report-handler.js';
export default router;

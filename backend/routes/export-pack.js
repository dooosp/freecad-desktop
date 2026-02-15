import { Router } from 'express';
import { exportPackHandler } from './handlers/export-pack-handler.js';

const router = Router();

/**
 * POST /api/export-pack - Generate deliverable pack (ZIP)
 * Input: {
 *   configPath: string,
 *   profileName?: string,
 *   templateName?: string,
 *   revision?: string,
 *   organization?: string,
 *   include: {
 *     step?: boolean,
 *     svg?: boolean,
 *     drawing_pdf?: boolean,
 *     dfm?: boolean,
 *     tolerance?: boolean,
 *     cost?: boolean,
 *     report?: boolean,
 *     bom?: boolean,
 *   },
 *   analysisResults?: object, // From /analyze endpoint
 *   reportPdfBase64?: string,  // From /report endpoint
 * }
 * Output: { zipBase64: string, filename: string }
 */
router.post('/', exportPackHandler);

export { exportPackHandler } from './handlers/export-pack-handler.js';
export default router;

import { Router } from 'express';
import { createDiagnosticsHandler } from './handlers/diagnostics-handler.js';

const router = Router();

router.get('/', createDiagnosticsHandler());

export { createDiagnosticsHandler } from './handlers/diagnostics-handler.js';
export default router;

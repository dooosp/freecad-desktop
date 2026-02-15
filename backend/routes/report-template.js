import { Router } from 'express';
import {
  listReportTemplatesHandler,
  getReportTemplateHandler,
  createReportTemplateHandler,
  updateReportTemplateHandler,
  deleteReportTemplateHandler,
} from './handlers/report-template-handler.js';

const router = Router();

router.get('/', listReportTemplatesHandler);
router.get('/:name', getReportTemplateHandler);
router.post('/', createReportTemplateHandler);
router.put('/:name', updateReportTemplateHandler);
router.delete('/:name', deleteReportTemplateHandler);

export default router;

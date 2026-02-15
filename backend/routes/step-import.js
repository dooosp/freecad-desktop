import { Router } from 'express';
import multer from 'multer';
import { runStepImportHandler, saveStepConfigHandler } from './handlers/step-import-handler.js';

const router = Router();
const upload = multer({ dest: '/tmp/freecad-uploads' });

router.post('/step/import', upload.single('file'), runStepImportHandler);
router.post('/step/save-config', saveStepConfigHandler);

export default router;

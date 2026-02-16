import { Router } from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runStepImportHandler, saveStepConfigHandler } from './handlers/step-import-handler.js';

const router = Router();
const uploadDir = join(tmpdir(), 'freecad-uploads');
mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

router.post('/step/import', upload.single('file'), runStepImportHandler);
router.post('/step/save-config', saveStepConfigHandler);

export default router;

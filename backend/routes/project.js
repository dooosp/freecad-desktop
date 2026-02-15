import { Router } from 'express';
import {
  saveProjectHandler,
  openProjectHandler,
  recentProjectsHandler,
} from './handlers/project-handlers.js';

const router = Router();

router.post('/save', saveProjectHandler);
router.post('/open', openProjectHandler);
router.get('/recent', recentProjectsHandler);

export {
  saveProjectHandler,
  openProjectHandler,
  recentProjectsHandler,
} from './handlers/project-handlers.js';
export default router;

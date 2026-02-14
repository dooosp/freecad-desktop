import { Router } from 'express';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

const router = Router();
const PROJECT_VERSION = 1;

function getProjectsDir(req) {
  return join(req.app.locals.freecadRoot, 'projects');
}

function getRecentPath(req) {
  return join(getProjectsDir(req), '.recent.json');
}

async function loadRecent(req) {
  try {
    const raw = await readFile(getRecentPath(req), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function updateRecent(req, entry) {
  const recent = await loadRecent(req);
  const filtered = recent.filter(r => r.path !== entry.path);
  filtered.unshift(entry);
  const trimmed = filtered.slice(0, 5);
  await writeFile(getRecentPath(req), JSON.stringify(trimmed, null, 2));
  return trimmed;
}

// Save project
router.post('/save', async (req, res) => {
  try {
    const { projectData } = req.body;
    if (!projectData || !projectData.name) {
      return res.status(400).json({ error: 'projectData with name is required' });
    }

    const dir = getProjectsDir(req);
    await mkdir(dir, { recursive: true });

    const data = { version: PROJECT_VERSION, ...projectData, saved: new Date().toISOString() };
    const filename = `${projectData.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.fcstudio`;
    const filePath = join(dir, filename);

    await writeFile(filePath, JSON.stringify(data));
    await updateRecent(req, { path: filePath, name: projectData.name, date: data.saved });

    res.json({ path: filePath, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Open project
router.post('/open', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath is required' });

    const raw = await readFile(filePath, 'utf-8');
    const projectData = JSON.parse(raw);

    await updateRecent(req, {
      path: filePath,
      name: projectData.name || basename(filePath, '.fcstudio'),
      date: projectData.saved || projectData.created || new Date().toISOString(),
    });

    res.json({ projectData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent projects
router.get('/recent', async (req, res) => {
  try {
    const recent = await loadRecent(req);
    res.json(recent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

const PROJECT_VERSION = 1;

export function getProjectsDir(req) {
  return join(req.app.locals.freecadRoot, 'projects');
}

export function getRecentPath(req) {
  return join(getProjectsDir(req), '.recent.json');
}

export async function loadRecent(req) {
  try {
    const raw = await readFile(getRecentPath(req), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function updateRecent(req, entry) {
  const recent = await loadRecent(req);
  const filtered = recent.filter((item) => item.path !== entry.path);
  filtered.unshift(entry);
  const trimmed = filtered.slice(0, 5);
  await writeFile(getRecentPath(req), JSON.stringify(trimmed, null, 2));
  return trimmed;
}

export async function saveProjectHandler(req, res) {
  try {
    const { projectData } = req.body;
    if (!projectData || !projectData.name) {
      return res.status(400).json({ error: 'projectData with name is required' });
    }

    const dir = getProjectsDir(req);
    await mkdir(dir, { recursive: true });

    const data = { version: PROJECT_VERSION, ...projectData, saved: new Date().toISOString() };
    const safeName = projectData.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'untitled';
    const filename = `${safeName}.fcstudio`;
    const filePath = join(dir, filename);

    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    await updateRecent(req, { path: filePath, name: projectData.name, date: data.saved });

    return res.json({ path: filePath, filename });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function openProjectHandler(req, res) {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath is required' });
    if (!String(filePath).toLowerCase().endsWith('.fcstudio')) {
      return res.status(400).json({ error: 'Only .fcstudio project files are supported' });
    }

    let raw;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch (err) {
      if (err?.code === 'ENOENT') return res.status(404).json({ error: 'Project file not found' });
      throw err;
    }

    let projectData;
    try {
      projectData = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid project file format (JSON parse failed)' });
    }

    await updateRecent(req, {
      path: filePath,
      name: projectData.name || basename(filePath, '.fcstudio'),
      date: projectData.saved || projectData.created || new Date().toISOString(),
    });

    return res.json({ projectData });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function recentProjectsHandler(req, res) {
  try {
    const recent = await loadRecent(req);
    return res.json(recent);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

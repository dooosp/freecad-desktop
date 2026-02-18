import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

function getTemplatesDir(freecadRoot) {
  return join(freecadRoot, 'configs', 'report-templates');
}

export async function listReportTemplatesHandler(req, res) {
  const freecadRoot = req.app.locals.freecadRoot;
  const templatesDir = getTemplatesDir(freecadRoot);

  try {
    const files = await readdir(templatesDir);
    const jsonFiles = files.filter((file) => file.endsWith('.json'));

    const templates = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const content = await readFile(join(templatesDir, file), 'utf8');
          const data = JSON.parse(content);
          return {
            name: file.replace('.json', ''),
            description: data.description || '',
            label: data.label || file.replace('.json', ''),
          };
        } catch {
          return null;
        }
      })
    );

    return res.json(templates.filter(Boolean));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function getReportTemplateHandler(req, res) {
  const { name } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid name format (use alphanumeric, _, -)' });
  }

  const freecadRoot = req.app.locals.freecadRoot;
  const templatePath = join(getTemplatesDir(freecadRoot), `${name}.json`);

  try {
    const content = await readFile(templatePath, 'utf8');
    const template = JSON.parse(content);
    return res.json({ name: req.params.name, ...template });
  } catch {
    return res.status(404).json({ error: 'Template not found' });
  }
}

export async function createReportTemplateHandler(req, res) {
  const freecadRoot = req.app.locals.freecadRoot;
  const { name, ...templateData } = req.body;

  if (!name) return res.status(400).json({ error: 'name required' });
  if (name === '_default') return res.status(400).json({ error: 'name _default is reserved' });
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid name format (use alphanumeric, _, -)' });
  }

  const templatePath = join(getTemplatesDir(freecadRoot), `${name}.json`);

  try {
    try {
      await readFile(templatePath, 'utf8');
      return res.status(409).json({ error: 'Template already exists' });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    const now = new Date().toISOString();
    const template = {
      name,
      ...templateData,
      created: now,
      updated: now,
    };

    await writeFile(templatePath, JSON.stringify(template, null, 2), 'utf8');
    return res.json({ success: true, name });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateReportTemplateHandler(req, res) {
  const { name } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid name format (use alphanumeric, _, -)' });
  }

  const freecadRoot = req.app.locals.freecadRoot;
  const templatePath = join(getTemplatesDir(freecadRoot), `${name}.json`);

  try {
    const existing = await readFile(templatePath, 'utf8');
    const current = JSON.parse(existing);

    const updated = {
      ...current,
      ...req.body,
      name: req.params.name,
      created: current.created,
      updated: new Date().toISOString(),
    };

    await writeFile(templatePath, JSON.stringify(updated, null, 2), 'utf8');
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteReportTemplateHandler(req, res) {
  const { name } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid name format (use alphanumeric, _, -)' });
  }
  if (name === '_default') {
    return res.status(400).json({ error: 'Cannot delete default template' });
  }

  const freecadRoot = req.app.locals.freecadRoot;
  const templatePath = join(getTemplatesDir(freecadRoot), `${name}.json`);

  try {
    await unlink(templatePath);
    return res.json({ success: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Template not found' });
    }
    return res.status(500).json({ error: err.message });
  }
}

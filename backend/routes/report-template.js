import { Router } from 'express';
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const router = Router();

/**
 * GET /api/report-templates - List all report templates
 */
router.get('/', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const templatesDir = join(freecadRoot, 'configs', 'report-templates');

  try {
    const files = await readdir(templatesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

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

    res.json(templates.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/report-templates/:name - Get single template
 */
router.get('/:name', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const templatePath = join(freecadRoot, 'configs', 'report-templates', `${req.params.name}.json`);

  try {
    const content = await readFile(templatePath, 'utf8');
    const template = JSON.parse(content);
    res.json({ name: req.params.name, ...template });
  } catch (err) {
    res.status(404).json({ error: 'Template not found' });
  }
});

/**
 * POST /api/report-templates - Create new template
 * Body: { name, label, description, sections, ... }
 */
router.post('/', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const { name, ...templateData } = req.body;

  if (!name) return res.status(400).json({ error: 'name required' });
  if (name === '_default') return res.status(400).json({ error: 'name _default is reserved' });
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid name format (use alphanumeric, _, -)' });
  }

  const templatePath = join(freecadRoot, 'configs', 'report-templates', `${name}.json`);

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
    res.json({ success: true, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/report-templates/:name - Update template
 */
router.put('/:name', async (req, res) => {
  const freecadRoot = req.app.locals.freecadRoot;
  const templatePath = join(freecadRoot, 'configs', 'report-templates', `${req.params.name}.json`);

  try {
    const existing = await readFile(templatePath, 'utf8');
    const current = JSON.parse(existing);

    const updated = {
      ...current,
      ...req.body,
      name: req.params.name,
      created: current.created, // preserve original
      updated: new Date().toISOString(),
    };

    await writeFile(templatePath, JSON.stringify(updated, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/report-templates/:name - Delete template (prevent _default deletion)
 */
router.delete('/:name', async (req, res) => {
  if (req.params.name === '_default') {
    return res.status(400).json({ error: 'Cannot delete default template' });
  }

  const freecadRoot = req.app.locals.freecadRoot;
  const templatePath = join(freecadRoot, 'configs', 'report-templates', `${req.params.name}.json`);

  try {
    await unlink(templatePath);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;

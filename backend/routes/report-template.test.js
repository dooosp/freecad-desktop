// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  listReportTemplatesHandler,
  getReportTemplateHandler,
  createReportTemplateHandler,
  updateReportTemplateHandler,
  deleteReportTemplateHandler,
} from './handlers/report-template-handler.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

const tempRoots = [];

async function makeTemplatesDir() {
  const freecadRoot = await mkdtemp(join(tmpdir(), 'report-template-handler-'));
  tempRoots.push(freecadRoot);
  const templatesDir = join(freecadRoot, 'configs', 'report-templates');
  await mkdir(templatesDir, { recursive: true });
  return { freecadRoot, templatesDir };
}

afterEach(async () => {
  await Promise.allSettled(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('report-template route handlers', () => {
  it('lists templates and skips invalid json entries', async () => {
    const { freecadRoot, templatesDir } = await makeTemplatesDir();

    await writeFile(
      join(templatesDir, 'custom.json'),
      JSON.stringify({ label: 'Custom', description: 'desc' }, null, 2),
      'utf8'
    );
    await writeFile(join(templatesDir, 'broken.json'), '{invalid', 'utf8');
    await writeFile(join(templatesDir, 'notes.txt'), 'ignore', 'utf8');

    const req = createMockReq({ appLocals: { freecadRoot } });
    const res = createMockRes();
    await listReportTemplatesHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual([
      {
        name: 'custom',
        description: 'desc',
        label: 'Custom',
      },
    ]);
  });

  it('gets a single template and returns 404 for missing template', async () => {
    const { freecadRoot, templatesDir } = await makeTemplatesDir();

    await writeFile(
      join(templatesDir, 'qa.json'),
      JSON.stringify({ name: 'qa', label: 'QA Template', sections: { drawing: { enabled: true } } }, null, 2),
      'utf8'
    );

    const req = createMockReq({ params: { name: 'qa' }, appLocals: { freecadRoot } });
    const res = createMockRes();
    await getReportTemplateHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({
      name: 'qa',
      label: 'QA Template',
    });

    const missingReq = createMockReq({ params: { name: 'missing' }, appLocals: { freecadRoot } });
    const missingRes = createMockRes();
    await getReportTemplateHandler(missingReq, missingRes);
    expect(missingRes.statusCode).toBe(404);
    expect(missingRes.jsonBody.error).toMatch(/Template not found/i);
  });

  it('creates a template with validation and duplicate guard', async () => {
    const { freecadRoot, templatesDir } = await makeTemplatesDir();

    const missingNameReq = createMockReq({ body: {}, appLocals: { freecadRoot } });
    const missingNameRes = createMockRes();
    await createReportTemplateHandler(missingNameReq, missingNameRes);
    expect(missingNameRes.statusCode).toBe(400);

    const reservedReq = createMockReq({ body: { name: '_default' }, appLocals: { freecadRoot } });
    const reservedRes = createMockRes();
    await createReportTemplateHandler(reservedReq, reservedRes);
    expect(reservedRes.statusCode).toBe(400);

    const invalidReq = createMockReq({ body: { name: 'bad name!' }, appLocals: { freecadRoot } });
    const invalidRes = createMockRes();
    await createReportTemplateHandler(invalidReq, invalidRes);
    expect(invalidRes.statusCode).toBe(400);

    const createReq = createMockReq({
      body: {
        name: 'shop_template',
        label: 'Shop Template',
        description: 'for smoke',
      },
      appLocals: { freecadRoot },
    });
    const createRes = createMockRes();
    await createReportTemplateHandler(createReq, createRes);

    expect(createRes.statusCode).toBe(200);
    expect(createRes.jsonBody).toEqual({ success: true, name: 'shop_template' });

    const writtenRaw = await readFile(join(templatesDir, 'shop_template.json'), 'utf8');
    const written = JSON.parse(writtenRaw);
    expect(written.name).toBe('shop_template');
    expect(written.created).toBeTruthy();
    expect(written.updated).toBeTruthy();

    const duplicateReq = createMockReq({
      body: { name: 'shop_template', label: 'Dup' },
      appLocals: { freecadRoot },
    });
    const duplicateRes = createMockRes();
    await createReportTemplateHandler(duplicateReq, duplicateRes);

    expect(duplicateRes.statusCode).toBe(409);
    expect(duplicateRes.jsonBody.error).toMatch(/already exists/i);
  });

  it('updates existing template and preserves created timestamp', async () => {
    const { freecadRoot, templatesDir } = await makeTemplatesDir();
    await writeFile(
      join(templatesDir, 'updatable.json'),
      JSON.stringify(
        {
          name: 'updatable',
          label: 'Before',
          created: '2026-01-01T00:00:00.000Z',
          updated: '2026-01-01T00:00:00.000Z',
        },
        null,
        2
      ),
      'utf8'
    );

    const req = createMockReq({
      params: { name: 'updatable' },
      body: { label: 'After', extra: { enabled: true } },
      appLocals: { freecadRoot },
    });
    const res = createMockRes();
    await updateReportTemplateHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ success: true });

    const updatedRaw = await readFile(join(templatesDir, 'updatable.json'), 'utf8');
    const updated = JSON.parse(updatedRaw);
    expect(updated.name).toBe('updatable');
    expect(updated.label).toBe('After');
    expect(updated.extra).toEqual({ enabled: true });
    expect(updated.created).toBe('2026-01-01T00:00:00.000Z');
    expect(updated.updated).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('deletes template with _default protection and missing-file handling', async () => {
    const { freecadRoot, templatesDir } = await makeTemplatesDir();
    await writeFile(join(templatesDir, 'delete_me.json'), JSON.stringify({ name: 'delete_me' }), 'utf8');

    const protectedReq = createMockReq({ params: { name: '_default' }, appLocals: { freecadRoot } });
    const protectedRes = createMockRes();
    await deleteReportTemplateHandler(protectedReq, protectedRes);
    expect(protectedRes.statusCode).toBe(400);

    const deleteReq = createMockReq({ params: { name: 'delete_me' }, appLocals: { freecadRoot } });
    const deleteRes = createMockRes();
    await deleteReportTemplateHandler(deleteReq, deleteRes);
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.jsonBody).toEqual({ success: true });

    await expect(access(join(templatesDir, 'delete_me.json'))).rejects.toBeTruthy();

    const missingReq = createMockReq({ params: { name: 'not_found' }, appLocals: { freecadRoot } });
    const missingRes = createMockRes();
    await deleteReportTemplateHandler(missingReq, missingRes);
    expect(missingRes.statusCode).toBe(404);
    expect(missingRes.jsonBody.error).toMatch(/Template not found/i);
  });
});

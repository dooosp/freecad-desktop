// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import profileRouter from './profile.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

const tempRoots = [];

function findRouteHandler(path, method) {
  const layer = profileRouter.stack.find(
    (item) => item.route?.path === path && item.route?.methods?.[method]
  );
  return layer?.route?.stack?.[0]?.handle;
}

const listProfilesHandler = findRouteHandler('/', 'get');
const getProfileHandler = findRouteHandler('/:name', 'get');
const createProfileHandler = findRouteHandler('/', 'post');
const updateProfileHandler = findRouteHandler('/:name', 'put');
const deleteProfileHandler = findRouteHandler('/:name', 'delete');

afterEach(async () => {
  await Promise.allSettled(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('profile route handlers in router', () => {
  it('lists profiles and skips invalid json files', async () => {
    expect(listProfilesHandler).toBeTypeOf('function');

    const freecadRoot = await mkdtemp(join(tmpdir(), 'profile-route-'));
    tempRoots.push(freecadRoot);
    const profilesDir = join(freecadRoot, 'configs', 'profiles');
    await mkdir(profilesDir, { recursive: true });

    await writeFile(
      join(profilesDir, 'sample_precision.json'),
      JSON.stringify({ label: 'Sample Precision', description: 'desc' }, null, 2),
      'utf8'
    );
    await writeFile(join(profilesDir, 'broken.json'), '{invalid', 'utf8');
    await writeFile(join(profilesDir, 'notes.txt'), 'ignore', 'utf8');

    const req = createMockReq({ appLocals: { freecadRoot } });
    const res = createMockRes();
    await listProfilesHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual([
      {
        name: 'sample_precision',
        label: 'Sample Precision',
        description: 'desc',
      },
    ]);
  });

  it('gets one profile and returns 404 when missing', async () => {
    expect(getProfileHandler).toBeTypeOf('function');

    const freecadRoot = await mkdtemp(join(tmpdir(), 'profile-route-'));
    tempRoots.push(freecadRoot);
    const profilesDir = join(freecadRoot, 'configs', 'profiles');
    await mkdir(profilesDir, { recursive: true });
    await writeFile(
      join(profilesDir, 'shop_a.json'),
      JSON.stringify({ label: 'Shop A', process_capabilities: { machining: { available: true } } }, null, 2),
      'utf8'
    );

    const req = createMockReq({
      params: { name: 'shop_a' },
      appLocals: { freecadRoot },
    });
    const res = createMockRes();
    await getProfileHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({ name: 'shop_a', label: 'Shop A' });

    const missingReq = createMockReq({
      params: { name: 'missing' },
      appLocals: { freecadRoot },
    });
    const missingRes = createMockRes();
    await getProfileHandler(missingReq, missingRes);
    expect(missingRes.statusCode).toBe(404);
    expect(missingRes.jsonBody.error).toMatch(/Profile not found/i);
  });

  it('creates profile with validation and duplicate guard', async () => {
    expect(createProfileHandler).toBeTypeOf('function');

    const freecadRoot = await mkdtemp(join(tmpdir(), 'profile-route-'));
    tempRoots.push(freecadRoot);
    const profilesDir = join(freecadRoot, 'configs', 'profiles');
    await mkdir(profilesDir, { recursive: true });

    const missingReq = createMockReq({ body: {}, appLocals: { freecadRoot } });
    const missingRes = createMockRes();
    await createProfileHandler(missingReq, missingRes);
    expect(missingRes.statusCode).toBe(400);

    const reservedReq = createMockReq({ body: { name: '_default' }, appLocals: { freecadRoot } });
    const reservedRes = createMockRes();
    await createProfileHandler(reservedReq, reservedRes);
    expect(reservedRes.statusCode).toBe(400);

    const invalidReq = createMockReq({ body: { name: 'bad name!' }, appLocals: { freecadRoot } });
    const invalidRes = createMockRes();
    await createProfileHandler(invalidReq, invalidRes);
    expect(invalidRes.statusCode).toBe(400);

    const createReq = createMockReq({
      body: { name: 'shop_a', label: 'Shop A', description: 'desc' },
      appLocals: { freecadRoot },
    });
    const createRes = createMockRes();
    await createProfileHandler(createReq, createRes);
    expect(createRes.statusCode).toBe(200);
    expect(createRes.jsonBody).toEqual({ success: true, name: 'shop_a' });

    const written = JSON.parse(await readFile(join(profilesDir, 'shop_a.json'), 'utf8'));
    expect(written.name).toBe('shop_a');
    expect(written.created).toBeTruthy();
    expect(written.updated).toBeTruthy();

    const duplicateReq = createMockReq({
      body: { name: 'shop_a', label: 'Dup' },
      appLocals: { freecadRoot },
    });
    const duplicateRes = createMockRes();
    await createProfileHandler(duplicateReq, duplicateRes);
    expect(duplicateRes.statusCode).toBe(409);
    expect(duplicateRes.jsonBody.error).toMatch(/already exists/i);
  });

  it('updates and deletes profile with reserved/missing guards', async () => {
    expect(updateProfileHandler).toBeTypeOf('function');
    expect(deleteProfileHandler).toBeTypeOf('function');

    const freecadRoot = await mkdtemp(join(tmpdir(), 'profile-route-'));
    tempRoots.push(freecadRoot);
    const profilesDir = join(freecadRoot, 'configs', 'profiles');
    await mkdir(profilesDir, { recursive: true });
    await writeFile(
      join(profilesDir, 'updatable.json'),
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

    const updateReq = createMockReq({
      params: { name: 'updatable' },
      body: { label: 'After', extra: { enabled: true } },
      appLocals: { freecadRoot },
    });
    const updateRes = createMockRes();
    await updateProfileHandler(updateReq, updateRes);

    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.jsonBody).toEqual({ success: true });

    const updated = JSON.parse(await readFile(join(profilesDir, 'updatable.json'), 'utf8'));
    expect(updated.name).toBe('updatable');
    expect(updated.label).toBe('After');
    expect(updated.extra).toEqual({ enabled: true });
    expect(updated.created).toBe('2026-01-01T00:00:00.000Z');
    expect(updated.updated).not.toBe('2026-01-01T00:00:00.000Z');

    const protectedReq = createMockReq({
      params: { name: '_default' },
      appLocals: { freecadRoot },
    });
    const protectedRes = createMockRes();
    await deleteProfileHandler(protectedReq, protectedRes);
    expect(protectedRes.statusCode).toBe(400);

    const deleteReq = createMockReq({
      params: { name: 'updatable' },
      appLocals: { freecadRoot },
    });
    const deleteRes = createMockRes();
    await deleteProfileHandler(deleteReq, deleteRes);
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.jsonBody).toEqual({ success: true });

    await expect(access(join(profilesDir, 'updatable.json'))).rejects.toBeTruthy();

    const missingReq = createMockReq({
      params: { name: 'missing' },
      appLocals: { freecadRoot },
    });
    const missingRes = createMockRes();
    await deleteProfileHandler(missingReq, missingRes);
    expect(missingRes.statusCode).toBe(404);
    expect(missingRes.jsonBody.error).toMatch(/Profile not found/i);
  });
});

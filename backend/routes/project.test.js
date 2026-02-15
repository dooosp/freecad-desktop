// @vitest-environment node
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  saveProjectHandler,
  openProjectHandler,
  recentProjectsHandler,
} from './handlers/project-handlers.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

const tempRoots = [];

afterEach(async () => {
  await Promise.allSettled(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('project route handlers', () => {
  it('validates required project name on save', async () => {
    const req = createMockReq({
      body: { projectData: { settings: { process: 'machining' } } },
      appLocals: { freecadRoot: '/tmp/noop' },
    });
    const res = createMockRes();

    await saveProjectHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/projectData with name is required/i);
  });

  it('saves project file and updates recent list', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'project-route-test-'));
    tempRoots.push(freecadRoot);

    const req = createMockReq({
      body: {
        projectData: {
          name: 'My Project!*',
          settings: { process: 'machining' },
          config: { path: 'configs/examples/ks_flange.toml' },
        },
      },
      appLocals: { freecadRoot },
    });
    const res = createMockRes();

    await saveProjectHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.filename).toBe('My_Project__.fcstudio');

    const savedRaw = await readFile(res.jsonBody.path, 'utf8');
    const saved = JSON.parse(savedRaw);
    expect(saved.version).toBe(1);
    expect(saved.name).toBe('My Project!*');
    expect(saved.saved).toBeTruthy();

    const recentRaw = await readFile(join(freecadRoot, 'projects', '.recent.json'), 'utf8');
    const recent = JSON.parse(recentRaw);
    expect(Array.isArray(recent)).toBe(true);
    expect(recent[0].path).toBe(res.jsonBody.path);
  });

  it('handles open validation and invalid JSON format', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'project-route-test-'));
    tempRoots.push(freecadRoot);

    const invalidReq = createMockReq({
      body: { filePath: '/tmp/not-project.txt' },
      appLocals: { freecadRoot },
    });
    const invalidRes = createMockRes();
    await openProjectHandler(invalidReq, invalidRes);
    expect(invalidRes.statusCode).toBe(400);

    const projectsDir = join(freecadRoot, 'projects');
    await mkdir(projectsDir, { recursive: true });
    const brokenPath = join(projectsDir, 'broken.fcstudio');
    await writeFile(brokenPath, 'not-json', 'utf8');

    const brokenReq = createMockReq({ body: { filePath: brokenPath }, appLocals: { freecadRoot } });
    const brokenRes = createMockRes();
    await openProjectHandler(brokenReq, brokenRes);

    expect(brokenRes.statusCode).toBe(400);
    expect(brokenRes.jsonBody.error).toMatch(/json parse failed/i);
  });

  it('opens project and returns recent list', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'project-route-test-'));
    tempRoots.push(freecadRoot);

    const projectsDir = join(freecadRoot, 'projects');
    await mkdir(projectsDir, { recursive: true });
    const projectPath = join(projectsDir, 'demo.fcstudio');
    await writeFile(
      projectPath,
      JSON.stringify({ name: 'Demo', settings: { batch: 10 }, saved: '2026-02-15T00:00:00.000Z' }, null, 2),
      'utf8'
    );

    const openReq = createMockReq({ body: { filePath: projectPath }, appLocals: { freecadRoot } });
    const openRes = createMockRes();
    await openProjectHandler(openReq, openRes);

    expect(openRes.statusCode).toBe(200);
    expect(openRes.jsonBody.projectData.name).toBe('Demo');

    const recentReq = createMockReq({ appLocals: { freecadRoot } });
    const recentRes = createMockRes();
    await recentProjectsHandler(recentReq, recentRes);

    expect(recentRes.statusCode).toBe(200);
    expect(recentRes.jsonBody[0].path).toBe(projectPath);
  });
});

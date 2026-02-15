// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

vi.mock('../lib/pack-builder.js', () => ({
  buildPack: vi.fn(async (options) => ({
    filename: `${options.partName || 'part'}.zip`,
    zipBase64: Buffer.from('mock-zip').toString('base64'),
  })),
}));

import { buildPack } from '../lib/pack-builder.js';
import { exportPackHandler } from './export-pack.js';

const tempRoots = [];

afterEach(async () => {
  await Promise.allSettled(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

beforeEach(() => {
  buildPack.mockClear();
});

describe('export-pack route handler', () => {
  it('returns 400 when configPath is missing', async () => {
    const req = createMockReq({
      body: { include: { dxf: true } },
      appLocals: { freecadRoot: '/tmp/noop' },
    });
    const res = createMockRes();

    await exportPackHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/configPath required/i);
    expect(buildPack).not.toHaveBeenCalled();
  });

  it('loads config and forwards normalized options to buildPack', async () => {
    const freecadRoot = await mkdtemp(join(tmpdir(), 'export-pack-route-test-'));
    tempRoots.push(freecadRoot);

    await mkdir(join(freecadRoot, 'lib'), { recursive: true });
    await writeFile(
      join(freecadRoot, 'lib', 'config-loader.js'),
      'export async function loadConfig(){ return { name: "loaded_cfg" }; }\n',
      'utf8'
    );

    const req = createMockReq({
      body: {
        configPath: 'configs/examples/ks_flange.toml',
        partName: 'route_pack_part',
        include: { dxf: true, report: true },
        analysisResults: { drawing: { drawing_paths: [] } },
      },
      appLocals: { freecadRoot },
    });
    const res = createMockRes();

    await exportPackHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.filename).toBe('route_pack_part.zip');
    expect(res.jsonBody.zipBase64).toBe(Buffer.from('mock-zip').toString('base64'));

    expect(buildPack).toHaveBeenCalledTimes(1);
    const [options] = buildPack.mock.calls[0];
    expect(options.freecadRoot).toBe(freecadRoot);
    expect(options.configPath).toBe('configs/examples/ks_flange.toml');
    expect(options.partName).toBe('route_pack_part');
    expect(options.config).toEqual({ name: 'loaded_cfg' });
    expect(options.include).toEqual({ dxf: true, report: true });
  });
});

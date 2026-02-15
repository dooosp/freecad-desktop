// @vitest-environment node
import { readFile, rm } from 'node:fs/promises';
import { describe, it, expect, vi } from 'vitest';

async function loadSmokeCoreWithEnv(overrides = {}) {
  const prev = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    prev.set(key, process.env[key]);
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  vi.resetModules();
  const mod = await import('./smoke-core.mjs');

  return {
    mod,
    restore() {
      for (const [key, value] of prev.entries()) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      vi.resetModules();
    },
  };
}

function buildCentralDirectoryZipBase64(names) {
  const headers = names.map((name) => {
    const fileName = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0); // central directory signature
    header.writeUInt16LE(20, 4); // version made by
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(0x0800, 8); // UTF-8 flag
    header.writeUInt16LE(0, 10); // compression method
    header.writeUInt16LE(0, 12); // mod time
    header.writeUInt16LE(0, 14); // mod date
    header.writeUInt32LE(0, 16); // CRC-32
    header.writeUInt32LE(0, 20); // compressed size
    header.writeUInt32LE(0, 24); // uncompressed size
    header.writeUInt16LE(fileName.length, 28); // file name length
    header.writeUInt16LE(0, 30); // extra length
    header.writeUInt16LE(0, 32); // comment length
    header.writeUInt16LE(0, 34); // disk number start
    header.writeUInt16LE(0, 36); // internal attrs
    header.writeUInt32LE(0, 38); // external attrs
    header.writeUInt32LE(0, 42); // local header offset
    return Buffer.concat([header, fileName]);
  });

  const centralDirectory = Buffer.concat(headers);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // central dir start disk
  eocd.writeUInt16LE(names.length, 8); // entries on this disk
  eocd.writeUInt16LE(names.length, 10); // total entries
  eocd.writeUInt32LE(centralDirectory.length, 12); // central directory size
  eocd.writeUInt32LE(0, 16); // central directory offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([centralDirectory, eocd]).toString('base64');
}

describe('smoke-core helpers', () => {
  it('finds EOCD and parses zip entries for DXF detection', async () => {
    const { mod, restore } = await loadSmokeCoreWithEnv();
    try {
      const zipBase64 = buildCentralDirectoryZipBase64([
        '00_meta/readme.txt',
        '02_drawing/mock-front.dxf',
      ]);
      const zipBuffer = Buffer.from(zipBase64, 'base64');

      expect(mod.findEndOfCentralDirectory(zipBuffer)).toBeGreaterThanOrEqual(0);
      expect(mod.listZipEntries(zipBase64)).toEqual([
        '00_meta/readme.txt',
        '02_drawing/mock-front.dxf',
      ]);
      expect(mod.hasDxfEntry(zipBase64)).toBe(true);
    } finally {
      restore();
    }
  });

  it('falls back to raw scan when ZIP central directory is missing', async () => {
    const { mod, restore } = await loadSmokeCoreWithEnv();
    try {
      const raw = Buffer.from('not-a-zip contains file.dxf marker', 'latin1').toString('base64');
      expect(mod.listZipEntries(raw)).toEqual([]);
      expect(mod.hasDxfEntry(raw)).toBe(true);
      expect(mod.findEndOfCentralDirectory(Buffer.from('plain-text'))).toBe(-1);
    } finally {
      restore();
    }
  });

  it('runs mock smoke end-to-end and persists summary payload', async () => {
    const outputPath = `/tmp/freecad-desktop-smoke-test-${Date.now()}.json`;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { mod, restore } = await loadSmokeCoreWithEnv({
      SMOKE_MOCK: '1',
      SMOKE_OUTPUT: outputPath,
      FREECAD_ROOT: '/tmp/freecad-automation-mock',
      BACKEND_PORT: '18081',
    });

    try {
      mod.resetMockTemplates();
      const payload = await mod.runSmoke();
      const saved = JSON.parse(await readFile(outputPath, 'utf8'));

      expect(payload.ok).toBe(true);
      expect(payload.summary.analyze.hasDxf).toBe(true);
      expect(payload.summary.exportPack.hasDxfEntry).toBe(true);
      expect(payload.summary.step.success).toBe(true);
      expect(saved.ok).toBe(true);
      expect(saved.summary.templateCrud.success).toBe(true);
      expect(errSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();
    } finally {
      await rm(outputPath, { force: true });
      restore();
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});

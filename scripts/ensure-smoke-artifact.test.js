// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REASON,
  INVALID_JSON_REASON,
  buildFallbackPayload,
  ensureSmokeArtifact,
} from './ensure-smoke-artifact.mjs';

describe('ensure-smoke-artifact', () => {
  it('builds a fallback payload with CI metadata', () => {
    const payload = buildFallbackPayload({
      workflow: 'Desktop CI',
      eventName: 'push',
      runId: '123',
      runAttempt: '2',
      sha: 'abc',
      generatedAt: '2026-02-15T10:00:00.000Z',
    });

    expect(payload.ok).toBe(false);
    expect(payload.reason).toBe(DEFAULT_REASON);
    expect(payload.workflow).toBe('Desktop CI');
    expect(payload.eventName).toBe('push');
    expect(payload.runId).toBe('123');
    expect(payload.runAttempt).toBe('2');
    expect(payload.sha).toBe('abc');
  });

  it('creates a fallback artifact when smoke output does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'freecad-desktop-smoke-'));
    const output = join(dir, 'artifacts', 'smoke-core-summary.json');

    try {
      const result = await ensureSmokeArtifact(output, {
        metadata: { workflow: 'Desktop CI', source: 'test' },
      });

      const saved = JSON.parse(await readFile(output, 'utf8'));
      expect(result.created).toBe(true);
      expect(saved.ok).toBe(false);
      expect(saved.reason).toBe(DEFAULT_REASON);
      expect(saved.workflow).toBe('Desktop CI');
      expect(saved.source).toBe('test');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps existing valid smoke output without rewriting', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'freecad-desktop-smoke-'));
    const outputDir = join(dir, 'artifacts');
    const output = join(outputDir, 'smoke-core-summary.json');

    try {
      await mkdir(outputDir, { recursive: true });
      await writeFile(output, `${JSON.stringify({ ok: true, summary: { stable: true } }, null, 2)}\n`, 'utf8');
      const before = await readFile(output, 'utf8');

      const result = await ensureSmokeArtifact(output, {
        metadata: { workflow: 'Desktop CI' },
      });
      const after = await readFile(output, 'utf8');

      expect(result.created).toBe(false);
      expect(result.reason).toBe('existing_valid');
      expect(after).toBe(before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rewrites invalid smoke JSON with fallback payload', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'freecad-desktop-smoke-'));
    const outputDir = join(dir, 'artifacts');
    const output = join(outputDir, 'smoke-core-summary.json');

    try {
      await mkdir(outputDir, { recursive: true });
      await writeFile(output, '{not-valid-json', 'utf8');

      const result = await ensureSmokeArtifact(output, {
        metadata: { workflow: 'Report Smoke Refresh', source: 'test' },
      });
      const saved = JSON.parse(await readFile(output, 'utf8'));

      expect(result.created).toBe(true);
      expect(result.reason).toBe(INVALID_JSON_REASON);
      expect(saved.ok).toBe(false);
      expect(saved.reason).toBe(INVALID_JSON_REASON);
      expect(saved.workflow).toBe('Report Smoke Refresh');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

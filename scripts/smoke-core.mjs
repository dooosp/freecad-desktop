import { spawn } from 'node:child_process';
import { copyFile, rm, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const port = Number(process.env.BACKEND_PORT || 18080);
const base = `http://localhost:${port}/api`;
const fallbackFreecadRoot = '/home/taeho/freecad-automation';
let freecadRoot = process.env.FREECAD_ROOT || fallbackFreecadRoot;

function sleep(ms) {
  return new Promise((resolveMs) => setTimeout(resolveMs, ms));
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} failed: ${data.error || `HTTP ${res.status}`}`);
  }
  return data;
}

async function isHealthy() {
  try {
    const res = await fetch(`${base}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function readHealth() {
  const res = await fetch(`${base}/health`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`health endpoint failed: HTTP ${res.status}`);
  }
  return data;
}

async function waitForHealth(maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i += 1) {
    if (await isHealthy()) return;
    await sleep(500);
  }
  throw new Error(`backend health check failed on port ${port}`);
}

function startBackend() {
  const proc = spawn('node', ['backend/server.js'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  proc.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  proc.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  return {
    proc,
    getLogs: () => logs,
  };
}

async function analyze(configPath) {
  const res = await fetch(`${base}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      configPath,
      options: {
        dfm: true,
        drawing: true,
        tolerance: true,
        cost: true,
        process: 'machining',
        material: 'SS304',
        batch: 100,
        standard: 'KS',
      },
    }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`/analyze failed: ${err.error || `HTTP ${res.status}`}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventType = null;
  let completed = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ') && eventType) {
        const payload = JSON.parse(line.slice(6));
        if (eventType === 'error') {
          throw new Error(`/analyze stream error: ${payload.error || 'unknown'}`);
        }
        if (eventType === 'complete') {
          completed = payload;
        }
        eventType = null;
      } else if (line === '') {
        eventType = null;
      }
    }
  }

  if (!completed) {
    throw new Error('/analyze did not emit a complete event');
  }

  return completed;
}

const tempFiles = [];
let ownedBackend = null;

async function main() {
  const summary = {};

  try {
    const healthy = await isHealthy();
    if (!healthy) {
      ownedBackend = startBackend();
      await waitForHealth();
    }

    const health = await readHealth();
    if (!process.env.FREECAD_ROOT && health?.freecadRoot) {
      freecadRoot = health.freecadRoot;
    }

    const configPath = process.env.SMOKE_CONFIG || 'configs/examples/ks_flange.toml';

    const profiles = await request('/profiles');
    summary.profile = {
      count: Array.isArray(profiles) ? profiles.length : 0,
      hasDefault: Array.isArray(profiles) ? profiles.some((p) => p.name === '_default') : false,
    };

    const analysis = await analyze(configPath);
    summary.analyze = {
      stages: analysis.stages || [],
      hasModel: Boolean(analysis.model),
      hasDrawing: Boolean(analysis.drawing),
      hasDfm: Boolean(analysis.dfm),
      hasCost: Boolean(analysis.cost),
      errors: Array.isArray(analysis.errors) ? analysis.errors.length : 0,
    };

    const rerun = await request('/dfm', {
      method: 'POST',
      body: {
        configPath,
        process: 'machining',
        standard: 'KS',
      },
    });
    summary.rerun = {
      stage: 'dfm',
      success: Boolean(rerun),
      score: rerun?.score ?? null,
    };

    const report = await request('/report', {
      method: 'POST',
      body: {
        configPath,
        analysisResults: analysis,
        metadata: {
          part_name: 'Smoke Part',
          drawing_number: 'SMOKE-001',
          revision: 'A',
        },
        sections: {
          model: true,
          drawing: true,
          dfm: true,
          tolerance: false,
          cost: true,
          bom: true,
        },
        options: {
          language: 'ko',
          disclaimer: true,
          signature: true,
        },
      },
    });
    summary.report = {
      success: Boolean(report),
      hasPdfBase64: Boolean(report?.pdfBase64),
    };

    const exported = await request('/export-pack', {
      method: 'POST',
      body: {
        configPath,
        partName: 'smoke_pack_part',
        revision: 'A',
        organization: 'smoke-test',
        include: {
          step: true,
          svg: true,
          dxf: false,
          drawing_pdf: true,
          dfm: true,
          tolerance: false,
          cost: true,
          report: true,
          bom: true,
        },
        analysisResults: analysis,
        reportPdfBase64: report?.pdfBase64 || null,
      },
    });
    summary.exportPack = {
      success: Boolean(exported),
      filename: exported?.filename || null,
      zipBytes: exported?.zipBase64 ? Buffer.from(exported.zipBase64, 'base64').length : 0,
    };

    const sourceStep = resolve(freecadRoot, 'output/ks_flange.step');
    await access(sourceStep);
    const tempStep = `/tmp/freecad-desktop-smoke-${Date.now()}.step`;
    await copyFile(sourceStep, tempStep);
    tempFiles.push(tempStep);

    const step = await request('/step/import', {
      method: 'POST',
      body: { filePath: tempStep },
    });

    await request('/step/save-config', {
      method: 'POST',
      body: {
        configPath: step.configPath,
        tomlString: step.tomlString,
      },
    });

    const importedConfig = resolve(freecadRoot, step.configPath);
    tempFiles.push(importedConfig);

    summary.step = {
      success: Boolean(step?.success),
      configPath: step?.configPath || null,
      hasAnalysis: Boolean(step?.analysis),
    };

    console.log(JSON.stringify({ ok: true, summary }, null, 2));
  } catch (error) {
    const backendLogs = ownedBackend?.getLogs?.() || '';
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
      backendLogs: backendLogs.trim() || undefined,
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await Promise.allSettled(tempFiles.map((p) => rm(p, { force: true })));

    if (ownedBackend?.proc) {
      ownedBackend.proc.kill('SIGTERM');
      await new Promise((resolveDone) => {
        ownedBackend.proc.once('exit', resolveDone);
        setTimeout(resolveDone, 1500);
      });
    }
  }
}

await main();

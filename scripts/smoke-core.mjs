import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { copyFile, rm, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const port = Number(process.env.BACKEND_PORT || 18080);
const base = `http://localhost:${port}/api`;
const fallbackFreecadRoot = '/home/taeho/freecad-automation';
const isMockMode = process.env.SMOKE_MOCK === '1';
let freecadRoot = process.env.FREECAD_ROOT || fallbackFreecadRoot;

function sleep(ms) {
  return new Promise((resolveMs) => setTimeout(resolveMs, ms));
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        resolveBody({});
      }
    });
  });
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

async function startMockApiServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { status: 'ok', freecadRoot: '/tmp/freecad-automation-mock' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/profiles') {
      sendJson(res, 200, [{ name: '_default' }, { name: 'sample_precision' }]);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      const result = {
        stages: ['create', 'drawing', 'dfm', 'cost'],
        errors: [],
        model: { exports: [{ format: 'step', path: 'output/mock.step' }] },
        drawing: { drawing_paths: [{ format: 'svg', path: 'output/mock.svg' }] },
        drawingSvg: '<svg></svg>',
        dfm: { score: 92 },
        cost: { unit_cost: 12345 },
      };

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const stages = ['create', 'drawing', 'dfm', 'cost'];
      for (const stage of stages) {
        res.write(`event: stage\ndata: ${JSON.stringify({ stage, status: 'done' })}\n\n`);
      }
      res.write(`event: complete\ndata: ${JSON.stringify(result)}\n\n`);
      res.end();
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/dfm') {
      await readBody(req);
      sendJson(res, 200, { score: 95, summary: 'mock' });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/report') {
      await readBody(req);
      sendJson(res, 200, { pdfBase64: Buffer.from('mock-report').toString('base64') });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/export-pack') {
      await readBody(req);
      sendJson(res, 200, {
        filename: 'mock-pack.zip',
        zipBase64: Buffer.from('mock-zip').toString('base64'),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/step/import') {
      await readBody(req);
      sendJson(res, 200, {
        success: true,
        analysis: { part_type: 'mock' },
        tomlString: 'name = "mock_part"',
        configPath: 'configs/imports/mock-part.toml',
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/step/save-config') {
      await readBody(req);
      sendJson(res, 200, { success: true });
      return;
    }

    sendJson(res, 404, { error: 'mock endpoint not found' });
  });

  await new Promise((resolveStart, rejectStart) => {
    server.once('error', rejectStart);
    server.listen(port, resolveStart);
  });

  return server;
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
let ownedMockServer = null;

async function main() {
  const summary = {};

  try {
    if (isMockMode) {
      ownedMockServer = await startMockApiServer();
    } else {
      const healthy = await isHealthy();
      if (!healthy) {
        ownedBackend = startBackend();
        await waitForHealth();
      }
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

    let stepImportPath = '/tmp/mock.step';
    if (!isMockMode) {
      const sourceStep = resolve(freecadRoot, 'output/ks_flange.step');
      await access(sourceStep);
      const tempStep = `/tmp/freecad-desktop-smoke-${Date.now()}.step`;
      await copyFile(sourceStep, tempStep);
      tempFiles.push(tempStep);
      stepImportPath = tempStep;
    }

    const step = await request('/step/import', {
      method: 'POST',
      body: { filePath: stepImportPath },
    });

    await request('/step/save-config', {
      method: 'POST',
      body: {
        configPath: step.configPath,
        tomlString: step.tomlString,
      },
    });

    if (!isMockMode) {
      const importedConfig = resolve(freecadRoot, step.configPath);
      tempFiles.push(importedConfig);
    }

    summary.step = {
      success: Boolean(step?.success),
      configPath: step?.configPath || null,
      hasAnalysis: Boolean(step?.analysis),
    };

    console.log(JSON.stringify({ ok: true, summary }, null, 2));
  } catch (error) {
    const backendLogs = ownedBackend?.getLogs?.() || undefined;
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
      backendLogs: backendLogs?.trim() || undefined,
      mode: isMockMode ? 'mock' : 'real',
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

    if (ownedMockServer) {
      await new Promise((resolveDone) => {
        ownedMockServer.close(() => resolveDone());
      });
    }
  }
}

await main();

import { spawn } from 'node:child_process';
import { copyFile, rm, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const port = Number(process.env.BACKEND_PORT || 18080);
const base = `http://localhost:${port}/api`;
const fallbackFreecadRoot = '/home/taeho/freecad-automation';
const isMockMode = process.env.SMOKE_MOCK === '1';
let freecadRoot = process.env.FREECAD_ROOT || fallbackFreecadRoot;
const mockTemplates = new Map();

function sleep(ms) {
  return new Promise((resolveMs) => setTimeout(resolveMs, ms));
}

function getMockHealth() {
  return { status: 'ok', freecadRoot: '/tmp/freecad-automation-mock' };
}

function getMockAnalyzeResult() {
  return {
    stages: ['create', 'drawing', 'dfm', 'cost'],
    errors: [],
    model: { exports: [{ format: 'step', path: 'output/mock.step' }] },
    drawing: {
      drawing_paths: [
        { format: 'svg', path: 'output/mock.svg' },
        { format: 'dxf', path: 'output/mock-front.dxf' },
        { format: 'pdf', path: 'output/mock-drawing.pdf' },
      ],
    },
    drawingSvg: '<svg></svg>',
    dfm: { score: 92 },
    cost: { unit_cost: 12345 },
  };
}

async function mockRequest(path, { method = 'GET', body = {} } = {}) {
  if (method === 'GET' && path === '/health') return getMockHealth();
  if (method === 'GET' && path === '/profiles') return [{ name: '_default' }, { name: 'sample_precision' }];
  if (method === 'POST' && path === '/profiles/compare') {
    return {
      profileA: { name: body.profileA || '_default', dfm: { score: 90 }, cost: { unit_cost: 10000 } },
      profileB: { name: body.profileB || 'sample_precision', dfm: { score: 95 }, cost: { unit_cost: 12000 } },
    };
  }
  if (method === 'POST' && path === '/dfm') return { score: 95, summary: 'mock' };
  if (method === 'POST' && path === '/report') return { pdfBase64: Buffer.from('mock-report').toString('base64') };
  if (method === 'GET' && path === '/report-templates') {
    const custom = [...mockTemplates.values()].map((tpl) => ({
      name: tpl.name,
      label: tpl.label || tpl.name,
      description: tpl.description || '',
    }));
    return [{ name: '_default', label: 'Default', description: '' }, ...custom];
  }
  if (method === 'GET' && path.startsWith('/report-templates/')) {
    const name = decodeURIComponent(path.split('/').pop() || '');
    const tpl = mockTemplates.get(name);
    if (!tpl) throw new Error(`${path} failed: Template not found`);
    return { ...tpl };
  }
  if (method === 'POST' && path === '/report-templates') {
    const now = new Date().toISOString();
    const tpl = { ...body, created: now, updated: now };
    mockTemplates.set(body.name, tpl);
    return { success: true, name: body.name };
  }
  if (method === 'PUT' && path.startsWith('/report-templates/')) {
    const name = decodeURIComponent(path.split('/').pop() || '');
    const current = mockTemplates.get(name) || { name };
    mockTemplates.set(name, { ...current, ...body, name, updated: new Date().toISOString() });
    return { success: true };
  }
  if (method === 'DELETE' && path.startsWith('/report-templates/')) {
    const name = decodeURIComponent(path.split('/').pop() || '');
    mockTemplates.delete(name);
    return { success: true };
  }
  if (method === 'POST' && path === '/export-pack') {
    return {
      filename: 'mock-pack.zip',
      zipBase64: Buffer.from('mock-zip 02_drawing/mock-front.dxf').toString('base64'),
    };
  }
  if (method === 'POST' && path === '/step/import') {
    return {
      success: true,
      analysis: { part_type: 'mock' },
      tomlString: 'name = "mock_part"',
      configPath: 'configs/imports/mock-part.toml',
    };
  }
  if (method === 'POST' && path === '/step/save-config') return { success: true };

  throw new Error(`mock endpoint not found: ${method} ${path}`);
}

async function request(path, { method = 'GET', body } = {}) {
  if (isMockMode) {
    return mockRequest(path, { method, body });
  }

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
  if (isMockMode) return true;

  try {
    const res = await fetch(`${base}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function readHealth() {
  if (isMockMode) return getMockHealth();

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findEndOfCentralDirectory(zipBuffer) {
  const EOCD_SIGNATURE = 0x06054b50;
  for (let i = zipBuffer.length - 22; i >= 0; i -= 1) {
    if (zipBuffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      return i;
    }
  }
  return -1;
}

function listZipEntries(zipBase64) {
  if (!zipBase64) return [];
  const zipBuffer = Buffer.from(zipBase64, 'base64');
  const eocdOffset = findEndOfCentralDirectory(zipBuffer);
  if (eocdOffset < 0) return [];

  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
  const entries = [];

  let ptr = centralDirectoryOffset;
  for (let i = 0; i < totalEntries && ptr + 46 <= zipBuffer.length; i += 1) {
    if (zipBuffer.readUInt32LE(ptr) !== CENTRAL_HEADER_SIGNATURE) break;
    const flags = zipBuffer.readUInt16LE(ptr + 8);
    const fileNameLength = zipBuffer.readUInt16LE(ptr + 28);
    const extraLength = zipBuffer.readUInt16LE(ptr + 30);
    const commentLength = zipBuffer.readUInt16LE(ptr + 32);
    const fileNameStart = ptr + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > zipBuffer.length) break;

    const encoding = (flags & 0x800) ? 'utf8' : 'latin1';
    entries.push(zipBuffer.toString(encoding, fileNameStart, fileNameEnd));
    ptr = fileNameEnd + extraLength + commentLength;
  }

  return entries;
}

function hasDxfEntry(zipBase64) {
  const entries = listZipEntries(zipBase64);
  if (entries.length > 0) {
    return entries.some((entry) => entry.toLowerCase().endsWith('.dxf'));
  }
  const raw = Buffer.from(zipBase64 || '', 'base64').toString('latin1').toLowerCase();
  return raw.includes('.dxf');
}

async function analyze(configPath) {
  if (isMockMode) {
    return getMockAnalyzeResult();
  }

  const res = await fetch(`${base}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      configPath,
      options: {
        dfm: true,
        drawing: true,
        dxfExport: true,
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
    if (!isMockMode) {
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
    assert(summary.profile.count >= 2, 'profile smoke requires at least 2 profiles');

    const analysis = await analyze(configPath);
    const drawingFormats = Array.isArray(analysis?.drawing?.drawing_paths)
      ? analysis.drawing.drawing_paths.map((entry) => entry?.format).filter(Boolean)
      : [];
    summary.analyze = {
      stages: analysis.stages || [],
      hasModel: Boolean(analysis.model),
      hasDrawing: Boolean(analysis.drawing),
      hasDxf: drawingFormats.includes('dxf'),
      hasDfm: Boolean(analysis.dfm),
      hasCost: Boolean(analysis.cost),
      errors: Array.isArray(analysis.errors) ? analysis.errors.length : 0,
    };
    assert(summary.analyze.hasDxf, 'analyze smoke missing DXF output');

    const [profileA, profileB] = profiles.slice(0, 2).map((p) => p.name);
    const profileCompare = await request('/profiles/compare', {
      method: 'POST',
      body: {
        configPath,
        profileA,
        profileB,
        options: {
          process: 'machining',
          material: 'SS304',
          batch: 100,
        },
      },
    });
    summary.profileCompare = {
      success: Boolean(profileCompare?.profileA && profileCompare?.profileB),
      profileA: profileCompare?.profileA?.name || null,
      profileB: profileCompare?.profileB?.name || null,
      scoreA: profileCompare?.profileA?.dfm?.score ?? null,
      scoreB: profileCompare?.profileB?.dfm?.score ?? null,
    };
    assert(summary.profileCompare.success, 'profile compare smoke failed');

    const smokeTemplateName = `smoke_template_${Date.now()}`;
    const smokeTemplatePath = resolve(freecadRoot, 'configs', 'report-templates', `${smokeTemplateName}.json`);
    if (!isMockMode) {
      tempFiles.push(smokeTemplatePath);
    }
    await request('/report-templates', {
      method: 'POST',
      body: {
        name: smokeTemplateName,
        label: 'Smoke Template',
        description: 'Smoke test template',
        language: 'ko',
        sections: {
          model_summary: { enabled: true, order: 1 },
          drawing: { enabled: true, order: 2 },
          dfm: { enabled: true, order: 3 },
          cost: { enabled: true, order: 4 },
        },
      },
    });
    const fetchedTemplate = await request(`/report-templates/${smokeTemplateName}`);
    await request(`/report-templates/${smokeTemplateName}`, {
      method: 'PUT',
      body: {
        description: 'Smoke template updated',
      },
    });
    const templateList = await request('/report-templates');
    await request(`/report-templates/${smokeTemplateName}`, { method: 'DELETE' });
    const templateListAfterDelete = await request('/report-templates');
    summary.templateCrud = {
      success: false,
      createdName: smokeTemplateName,
      fetched: fetchedTemplate?.name === smokeTemplateName,
      listed: Array.isArray(templateList) && templateList.some((t) => t.name === smokeTemplateName),
      deleted: Array.isArray(templateListAfterDelete) && !templateListAfterDelete.some((t) => t.name === smokeTemplateName),
    };
    summary.templateCrud.success = summary.templateCrud.fetched && summary.templateCrud.listed && summary.templateCrud.deleted;
    assert(summary.templateCrud.fetched, 'template CRUD smoke failed to fetch created template');
    assert(summary.templateCrud.listed, 'template CRUD smoke failed to list created template');
    assert(summary.templateCrud.deleted, 'template CRUD smoke failed to delete template');

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
          dxf: true,
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
      hasDxfEntry: hasDxfEntry(exported?.zipBase64),
    };
    assert(summary.exportPack.hasDxfEntry, 'export pack smoke missing DXF file');

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
  }
}

await main();

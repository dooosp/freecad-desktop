import { Router } from 'express';
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { asyncHandler, createHttpError } from '../lib/async-handler.js';
import { loadShopProfile } from '../lib/profile-loader.js';

const router = Router();

function toBool(val, fallback) {
  if (typeof val === 'boolean') return val;
  return fallback;
}

export function mergeTemplateOverrides(template, sections, options) {
  const merged = { ...(template || {}) };

  if (sections && typeof sections === 'object') {
    const sectionMap = {
      model: 'model_summary',
      drawing: 'drawing',
      dfm: 'dfm',
      tolerance: 'tolerance',
      cost: 'cost',
      bom: 'bom',
    };
    merged.sections = { ...(merged.sections || {}) };
    const nextOrder = Object.keys(merged.sections).length + 1;

    for (const [rawKey, enabled] of Object.entries(sections)) {
      if (typeof enabled !== 'boolean') continue;
      const key = sectionMap[rawKey] || rawKey;
      const current = { ...(merged.sections[key] || {}) };
      current.enabled = enabled;
      if (current.order === undefined) current.order = nextOrder;
      merged.sections[key] = current;
    }
  }

  if (options && typeof options === 'object') {
    if (options.language) merged.language = options.language;
    if (typeof options.disclaimer === 'boolean') {
      merged.disclaimer = { ...(merged.disclaimer || {}), enabled: options.disclaimer };
    }
    if (typeof options.signature === 'boolean') {
      merged.signature = { ...(merged.signature || {}), enabled: options.signature };
    }
  }

  return merged;
}

function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  // Remove isolated surrogate code points that break matplotlib font rendering.
  return value
    .replace(/\\u[dD][0-9a-fA-F]{4}/g, '')
    .replace(/[\uD800-\uDFFF]/g, '');
}

export function sanitizeObject(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeObject);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeObject(v);
    return out;
  }
  return value;
}

/**
 * POST /api/report - Generate integrated PDF report
 * Input: { configPath: string, includeDrawing, includeDfm, includeTolerance, includeCost }
 */
export async function generateReportHandler(req, res) {
  const { freecadRoot, runScript, loadConfig } = req.app.locals;
  const {
    configPath,
    includeDrawing = true,
    includeDfm = true,
    includeTolerance = true,
    includeCost = true,
    analysisResults = null,
    templateName = null,
    metadata = null,
    sections = null,
    options = null,
    profileName = null,
  } = req.body;

  if (!configPath) throw createHttpError(400, 'configPath required');

  const config = await loadConfig(resolve(freecadRoot, configPath));
  const normalizedResults = (analysisResults && typeof analysisResults === 'object')
    ? sanitizeObject(analysisResults)
    : {};

  const shopProfile = await loadShopProfile(freecadRoot, profileName);

  // Load report template if specified
  let reportTemplate = null;
  if (templateName) {
    try {
      const templatePath = join(freecadRoot, 'configs', 'report-templates', `${templateName}.json`);
      const templateContent = await readFile(templatePath, 'utf8');
      const template = mergeTemplateOverrides(JSON.parse(templateContent), sections, options);
      const templateMetadata = {
        ...(metadata || {}),
        profile_name: profileName || '',
        template_name: templateName,
      };
      reportTemplate = {
        template_path: templatePath,
        template,
        metadata: templateMetadata,
      };
    } catch {
      // Template load failed, continue without it
    }
  }

  const tolInput = normalizedResults.tolerance
    ? { ...normalizedResults.tolerance }
    : null;
  if (tolInput && !Array.isArray(tolInput.fits) && Array.isArray(tolInput.pairs)) {
    tolInput.fits = tolInput.pairs.map((pair) => ({
      bore: pair.bore_part || '',
      shaft: pair.shaft_part || '',
      spec: pair.spec || '',
      fit_type: pair.fit_type || '',
      min_clearance: pair.clearance_min,
      max_clearance: pair.clearance_max,
    }));
  }

  const resolvedIncludeDrawing = toBool(sections?.drawing, includeDrawing);
  const resolvedIncludeDfm = toBool(sections?.dfm, includeDfm);
  const resolvedIncludeTolerance = toBool(sections?.tolerance, includeTolerance);
  const resolvedIncludeCost = toBool(sections?.cost, includeCost);

  // Ensure export directory points to freecad-automation/output
  const outputDir = resolve(freecadRoot, 'output');
  const modelResult = normalizedResults.model || {};
  const qaResult = resolvedIncludeDrawing ? (normalizedResults.qa || {}) : {};
  const dfmResult = resolvedIncludeDfm ? (normalizedResults.dfm || {}) : {};
  const toleranceResult = resolvedIncludeTolerance ? (tolInput || {}) : {};
  const costResult = resolvedIncludeCost ? (normalizedResults.cost || {}) : {};

  const reportInput = {
    ...config,
    standard: (analysisResults && analysisResults.standard) || config.standard || options?.standard || 'KS',
    ...(shopProfile ? { shop_profile: shopProfile } : {}),
    export: { ...config.export, directory: outputDir },
    _report_options: {
      include_drawing: resolvedIncludeDrawing,
      include_dfm: resolvedIncludeDfm,
      include_tolerance: resolvedIncludeTolerance,
      include_cost: resolvedIncludeCost,
    },
    _analysis_results: normalizedResults,
    model_result: modelResult,
    qa_result: qaResult,
    dfm_results: dfmResult,
    tolerance_results: toleranceResult,
    cost_result: costResult,
    bom: normalizedResults.drawing?.bom || config.bom || [],
  };

  // Inject template if available
  if (reportTemplate) {
    reportInput._report_template = reportTemplate;
  }

  const result = await runScript('engineering_report.py', reportInput, { timeout: 180_000 });

  // Read PDF — result.path is relative or absolute Windows path
  const pdfRelPath = result.pdf_path || result.path;
  if (pdfRelPath) {
    try {
      const { toWSL } = await import(`${freecadRoot}/lib/paths.js`);
      const pdfWSL = toWSL(pdfRelPath);
      const pdfBuffer = await readFile(pdfWSL);
      result.pdfBase64 = pdfBuffer.toString('base64');
    } catch { /* PDF read optional */ }
  }

  res.json(result);
}

router.post('/report', asyncHandler(generateReportHandler));

export default router;

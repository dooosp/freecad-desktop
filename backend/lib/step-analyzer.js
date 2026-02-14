import { basename, extname, resolve } from 'node:path';

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function compactErrorMessage(message) {
  if (!message) return 'unknown error';
  const firstLine = String(message).split('\n')[0].trim();
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
}

function extractBBox(model = {}) {
  const bb = model.bounding_box || {};
  if (Array.isArray(bb.size) && bb.size.length >= 3) {
    return {
      x: toNumber(bb.size[0]),
      y: toNumber(bb.size[1]),
      z: toNumber(bb.size[2]),
    };
  }
  if (Array.isArray(bb.min) && Array.isArray(bb.max) && bb.min.length >= 3 && bb.max.length >= 3) {
    return {
      x: Math.abs(toNumber(bb.max[0]) - toNumber(bb.min[0])),
      y: Math.abs(toNumber(bb.max[1]) - toNumber(bb.min[1])),
      z: Math.abs(toNumber(bb.max[2]) - toNumber(bb.min[2])),
    };
  }
  return {
    x: toNumber(bb.x),
    y: toNumber(bb.y),
    z: toNumber(bb.z),
  };
}

function baseSuggestedConfig(stepFilePath, titleName = 'Imported Part') {
  const stem = basename(stepFilePath, extname(stepFilePath));
  return {
    name: `imported_${stem}`,
    import: {
      source_step: stepFilePath,
      template_only: true,
    },
    export: { step: true, stl: true },
    drawing: {
      scale: 'auto',
      title: titleName,
    },
    manufacturing: { process: 'machining' },
  };
}

function normalizeAnalysis(raw, stepFilePath) {
  const features = raw?.features || {};
  return {
    ...raw,
    success: raw?.success !== false,
    features,
    source_step: raw?.source_step || stepFilePath,
    cylinders: Array.isArray(features.cylinders) ? features.cylinders.length : toNumber(raw?.cylinders),
    bolt_circles: Array.isArray(features.bolt_circles) ? features.bolt_circles.length : toNumber(raw?.bolt_circles),
    suggested_config: raw?.suggested_config || baseSuggestedConfig(stepFilePath),
  };
}

/**
 * Analyze STEP file via Python script → auto-generate config.
 * @param {string} freecadRoot - Path to freecad-automation root
 * @param {string} stepFilePath - Path to STEP file
 * @returns {Promise<object>} Analysis result with features and suggested config
 */
export async function analyzeStep(freecadRoot, stepFilePath) {
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);
  try {
    const result = await runScript('step_feature_detector.py', {
      file: stepFilePath,
    }, { timeout: 120_000 });
    return normalizeAnalysis(result, stepFilePath);
  } catch (primaryErr) {
    // Fallback: keep STEP import usable even when feature detector fails.
    const inspected = await runScript('inspect_model.py', {
      file: stepFilePath,
    }, { timeout: 60_000 });
    const model = inspected?.model || {};
    const bbox = extractBBox(model);
    return normalizeAnalysis({
      success: true,
      fallback: true,
      warning: `Feature detector failed; using inspect fallback: ${compactErrorMessage(primaryErr.message)}`,
      source_step: stepFilePath,
      part_type: 'block',
      bounding_box: bbox,
      volume: toNumber(model.volume),
      area: toNumber(model.area),
      features: {
        cylinders: [],
        bolt_circles: [],
        central_bore: null,
        fillets: [],
        chamfers: [],
        face_count: toNumber(model.faces),
        edge_count: toNumber(model.edges),
      },
      suggested_config: baseSuggestedConfig(stepFilePath, basename(stepFilePath)),
    }, stepFilePath);
  }
}

/**
 * Generate a TOML config string from detected features.
 * @param {object} analysis - Result from analyzeStep
 * @param {object} userOverrides - User modifications
 * @returns {string} TOML-formatted config string
 */
export function generateConfigFromAnalysis(analysis, userOverrides = {}) {
  const config = { ...analysis.suggested_config, ...userOverrides };
  const sourceStep = config.import?.source_step || analysis.source_step;

  // Build TOML string
  const lines = [];
  lines.push(`name = "${config.name || 'imported_part'}"`);
  lines.push('');

  if (sourceStep) {
    lines.push('[import]');
    lines.push(`source_step = "${sourceStep.replaceAll('\\', '\\\\')}"`);
    lines.push(`template_only = ${config.import?.template_only === false ? 'false' : 'true'}`);
    lines.push('');
    lines.push('# NOTE: This imported config is a template.');
    lines.push('# Add [[shapes]] / [[operations]] or [[parts]] before running Analyze.');
    lines.push('');
  }

  if (config.export) {
    lines.push('[export]');
    if (config.export.step) lines.push('step = true');
    if (config.export.stl) lines.push('stl = true');
    lines.push('');
  }

  if (config.drawing) {
    lines.push('[drawing]');
    lines.push(`scale = "${config.drawing.scale || 'auto'}"`);
    lines.push(`title = "${config.drawing.title || config.name || 'Part'}"`);
    lines.push('');
  }

  if (config.manufacturing) {
    lines.push('[manufacturing]');
    lines.push(`process = "${config.manufacturing.process || 'machining'}"`);
    if (config.manufacturing.material) {
      lines.push(`material = "${config.manufacturing.material}"`);
    }
    lines.push('');
  }

  if (config.tolerance?.pairs?.length > 0) {
    lines.push('[tolerance]');
    for (const pair of config.tolerance.pairs) {
      lines.push('[[tolerance.pairs]]');
      lines.push(`bore = ${pair.bore}`);
      lines.push(`shaft = ${pair.shaft}`);
      lines.push(`spec = "${pair.spec || 'H7/g6'}"`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

import { resolve } from 'node:path';

/**
 * Analyze STEP file via Python script → auto-generate config.
 * @param {string} freecadRoot - Path to freecad-automation root
 * @param {string} stepFilePath - Path to STEP file
 * @returns {Promise<object>} Analysis result with features and suggested config
 */
export async function analyzeStep(freecadRoot, stepFilePath) {
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);

  const result = await runScript('step_feature_detector.py', {
    file: stepFilePath,
  }, { timeout: 120_000 });

  return result;
}

/**
 * Generate a TOML config string from detected features.
 * @param {object} analysis - Result from analyzeStep
 * @param {object} userOverrides - User modifications
 * @returns {string} TOML-formatted config string
 */
export function generateConfigFromAnalysis(analysis, userOverrides = {}) {
  const config = { ...analysis.suggested_config, ...userOverrides };

  // Build TOML string
  const lines = [];
  lines.push(`name = "${config.name || 'imported_part'}"`);
  lines.push('');

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

import { spawn } from 'node:child_process';
import { basename, join, resolve } from 'node:path';

function isWindowsAbsolutePath(path) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
}

function toCanonicalWslPath(path, toWSL) {
  if (path.startsWith('/')) return resolve(path);
  if (isWindowsAbsolutePath(path)) return toWSL(path);
  return resolve(process.cwd(), path.replaceAll('\\', '/'));
}

/**
 * Run qa_scorer.py as a CLI tool (not stdin-JSON).
 * @param {string} freecadRoot - Path to freecad-automation root
 * @param {string} svgPath - SVG path returned by generate_drawing.py
 * @param {object} [opts]
 * @param {string} [opts.planPath] - Path to plan/config TOML/JSON for intent metrics
 * @param {string} [opts.configPath] - Path to config TOML/JSON for DFM-integrated metrics
 * @param {string} [opts.weightsPreset] - QA weight profile: default|auto|flange|...
 * @returns {Promise<object>} QA score result
 */
export async function runQaScorer(freecadRoot, svgPath, opts = {}) {
  if (!svgPath || typeof svgPath !== 'string') {
    throw new Error('svgPath is required for qa_scorer');
  }

  const { toWindows, toWSL, PYTHON_EXE_WSL } = await import(`${freecadRoot}/lib/paths.js`);
  const scriptWin = toWindows(join(freecadRoot, 'scripts', 'qa_scorer.py'));
  const svgWslPath = toCanonicalWslPath(svgPath, toWSL);
  const svgWin = toWindows(svgWslPath);
  const args = [scriptWin, svgWin];

  if (opts.planPath) {
    const planWsl = toCanonicalWslPath(opts.planPath, toWSL);
    args.push('--plan', toWindows(planWsl));
  }
  if (opts.configPath) {
    const configWsl = toCanonicalWslPath(opts.configPath, toWSL);
    args.push('--config', toWindows(configWsl));
  }
  if (opts.weightsPreset) {
    args.push('--weights-preset', String(opts.weightsPreset));
  }

  const stdout = await new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_EXE_WSL, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', c => { stdout += c; });
    proc.stderr.on('data', c => { stderr += c; });
    proc.on('close', code => {
      if (code !== 0) {
        const tail = `${stderr.slice(-300)} ${stdout.slice(-300)}`.trim();
        return reject(new Error(`qa_scorer exited ${code}: ${tail}`));
      }
      resolve(stdout);
    });
    proc.on('error', reject);
  });

  const scoreMatch = stdout.match(/QA Score:\s*(\d+)\/100/i);
  if (!scoreMatch) {
    throw new Error(`qa_scorer output did not include score: ${stdout.slice(-300)}`);
  }

  const profileMatch = stdout.match(/weight_profile:\s*([a-z0-9_-]+)/i);
  return {
    score: Number(scoreMatch[1]),
    file: basename(svgWslPath),
    weightProfile: profileMatch ? profileMatch[1] : undefined,
  };
}

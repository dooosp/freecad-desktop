import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, parse, resolve } from 'node:path';

function isWindowsAbsolutePath(path) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
}

function toCanonicalWslPath(path, toWSL) {
  if (path.startsWith('/')) return resolve(path);
  if (isWindowsAbsolutePath(path)) return toWSL(path);
  return resolve(process.cwd(), path.replaceAll('\\', '/'));
}

function getQaJsonPath(svgWslPath) {
  const parsed = parse(svgWslPath);
  const qaFileName = parsed.base.endsWith('_drawing.svg')
    ? parsed.base.replace(/_drawing\.svg$/i, '_qa.json')
    : `${parsed.name}_qa.json`;
  return join(parsed.dir, qaFileName);
}

/**
 * Run qa_scorer.py as a CLI tool (not stdin-JSON).
 * @param {string} freecadRoot - Path to freecad-automation root
 * @param {string} svgPath - SVG path returned by generate_drawing.py
 * @returns {Promise<object>} QA score result
 */
export async function runQaScorer(freecadRoot, svgPath) {
  if (!svgPath || typeof svgPath !== 'string') {
    throw new Error('svgPath is required for qa_scorer');
  }

  const { toWindows, toWSL, PYTHON_EXE_WSL } = await import(`${freecadRoot}/lib/paths.js`);
  const scriptWin = toWindows(join(freecadRoot, 'scripts', 'qa_scorer.py'));
  const svgWslPath = toCanonicalWslPath(svgPath, toWSL);
  const svgWin = toWindows(svgWslPath);
  const qaJsonPath = getQaJsonPath(svgWslPath);
  const qaJsonWin = toWindows(qaJsonPath);

  await new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_EXE_WSL, [scriptWin, svgWin, '--json', qaJsonWin], {
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
      resolve();
    });
    proc.on('error', reject);
  });

  const qaJson = await readFile(qaJsonPath, 'utf8');
  return JSON.parse(qaJson);
}

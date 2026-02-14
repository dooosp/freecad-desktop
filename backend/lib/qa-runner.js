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

  const stdout = await new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_EXE_WSL, [scriptWin, svgWin], {
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

  return {
    score: Number(scoreMatch[1]),
    file: basename(svgWslPath),
  };
}

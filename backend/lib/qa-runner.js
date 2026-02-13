import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Run qa_scorer.py as a CLI tool (not stdin-JSON).
 * @param {string} freecadRoot - Path to freecad-automation root
 * @param {string} stem - Model name stem (e.g. "ks_flange")
 * @returns {Promise<object>} QA score result
 */
export async function runQaScorer(freecadRoot, stem) {
  const { toWindows, PYTHON_EXE_WSL } = await import(`${freecadRoot}/lib/paths.js`);
  const scriptWin = toWindows(join(freecadRoot, 'scripts', 'qa_scorer.py'));
  const svgWslPath = join(freecadRoot, 'output', `${stem}_drawing.svg`);
  const svgWin = toWindows(svgWslPath);
  const qaJsonPath = join(freecadRoot, 'output', `${stem}_qa.json`);
  const qaJsonWin = toWindows(qaJsonPath);

  await new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_EXE_WSL, [scriptWin, svgWin, '--json', qaJsonWin], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    let stderr = '';
    proc.stderr.on('data', c => { stderr += c; });
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`qa_scorer exited ${code}: ${stderr.slice(-500)}`));
      resolve();
    });
    proc.on('error', reject);
  });

  const qaJson = await readFile(qaJsonPath, 'utf8');
  return JSON.parse(qaJson);
}

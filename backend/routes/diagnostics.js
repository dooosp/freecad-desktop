import { Router } from 'express';
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const router = Router();

async function checkExists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function checkWritable(path) {
  try { await access(path, constants.W_OK); return true; } catch { return false; }
}

async function runCmd(cmd, args, timeout = 5000) {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout });
    return stdout.trim();
  } catch (err) {
    return null;
  }
}

const REQUIRED_SCRIPTS = [
  'create_model.py',
  'inspect_model.py',
  'dfm_checker.py',
  'generate_drawing.py',
  'tolerance_analysis.py',
  'cost_estimator.py',
  'engineering_report.py',
];

async function getPythonCandidates() {
  const candidates = [];
  if (process.env.PYTHON_EXE_WSL) candidates.push(process.env.PYTHON_EXE_WSL);
  if (process.env.PYTHON_EXE) candidates.push(process.env.PYTHON_EXE);

  const freecadPy = await runCmd('wslpath', ['-u', 'C:\\Program Files\\FreeCAD 1.0\\bin\\python.exe']);
  if (freecadPy) candidates.push(freecadPy);

  candidates.push('python3');
  return [...new Set(candidates)];
}

router.get('/', async (req, res) => {
  const root = req.app.locals.freecadRoot;
  const checks = [];
  let hasFailure = false;
  let hasWarning = false;

  // 1. freecadRoot
  const rootExists = await checkExists(root);
  checks.push({ id: 'freecadRoot', label: 'FreeCAD Automation', status: rootExists ? 'pass' : 'fail', detail: rootExists ? root : 'Directory not found' });
  if (!rootExists) hasFailure = true;

  // 2. wslpath
  const wslpath = await runCmd('which', ['wslpath']);
  checks.push({ id: 'wslpath', label: 'WSL Path Utility', status: wslpath ? 'pass' : 'warn', detail: wslpath || 'Not found (non-WSL environment)' });
  if (!wslpath) hasWarning = true;

  // 3. python
  const pythonCandidates = await getPythonCandidates();
  let pythonExe = null;
  let pyVersion = null;
  for (const candidate of pythonCandidates) {
    const version = await runCmd(candidate, ['--version']);
    if (version) {
      pythonExe = candidate;
      pyVersion = version;
      break;
    }
  }
  checks.push({
    id: 'python',
    label: 'Python Executable',
    status: pyVersion ? 'pass' : 'fail',
    detail: pyVersion ? `${pyVersion} (${pythonExe})` : `No runnable Python found (checked: ${pythonCandidates.join(', ')})`,
  });
  if (!pyVersion) hasFailure = true;

  // 4. FreeCAD module
  let fcVersion = null;
  let fcPythonExe = pythonExe;
  for (const candidate of pythonCandidates) {
    const version = await runCmd(candidate, ['-c', 'import FreeCAD; print(FreeCAD.Version()[0] + "." + FreeCAD.Version()[1])']);
    if (version) {
      fcVersion = version;
      fcPythonExe = candidate;
      break;
    }
  }
  checks.push({
    id: 'freecadModule',
    label: 'FreeCAD Module',
    status: fcVersion ? 'pass' : 'fail',
    detail: fcVersion ? `FreeCAD ${fcVersion} (${fcPythonExe})` : 'FreeCAD module not importable from detected Python executables',
  });
  if (!fcVersion) hasFailure = true;

  // 5. scripts
  const scriptsDir = join(root, 'scripts');
  const missing = [];
  for (const s of REQUIRED_SCRIPTS) {
    if (!(await checkExists(join(scriptsDir, s)))) missing.push(s);
  }
  checks.push({ id: 'scripts', label: 'Analysis Scripts', status: missing.length === 0 ? 'pass' : 'fail', detail: missing.length === 0 ? `${REQUIRED_SCRIPTS.length} scripts found` : `Missing: ${missing.join(', ')}` });
  if (missing.length > 0) hasFailure = true;

  // 6. output dir
  const outputDir = join(root, 'output');
  const outExists = await checkExists(outputDir);
  const outWritable = outExists && await checkWritable(outputDir);
  checks.push({ id: 'outputDir', label: 'Output Directory', status: outWritable ? 'pass' : outExists ? 'warn' : 'fail', detail: outWritable ? outputDir : outExists ? 'Not writable' : 'Directory not found' });
  if (!outExists) hasFailure = true;
  else if (!outWritable) hasWarning = true;

  const overall = hasFailure ? 'fail' : hasWarning ? 'warn' : 'pass';
  res.json({ checks, overall });
});

export default router;

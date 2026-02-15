import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const REQUIRED_SCRIPTS = [
  'create_model.py',
  'inspect_model.py',
  'dfm_checker.py',
  'generate_drawing.py',
  'tolerance_analysis.py',
  'cost_estimator.py',
  'engineering_report.py',
];

export async function checkExists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

export async function checkWritable(path) {
  try { await access(path, constants.W_OK); return true; } catch { return false; }
}

export async function runCmd(cmd, args, timeout = 5000) {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function getPythonCandidates(runCmdFn = runCmd) {
  const candidates = [];
  if (process.env.PYTHON_EXE_WSL) candidates.push(process.env.PYTHON_EXE_WSL);
  if (process.env.PYTHON_EXE) candidates.push(process.env.PYTHON_EXE);

  const freecadPy = await runCmdFn('wslpath', ['-u', 'C:\\Program Files\\FreeCAD 1.0\\bin\\python.exe']);
  if (freecadPy) candidates.push(freecadPy);

  candidates.push('python3');
  return [...new Set(candidates)];
}

export function createDiagnosticsHandler(deps = {}) {
  const {
    checkExistsFn = checkExists,
    checkWritableFn = checkWritable,
    runCmdFn = runCmd,
    getPythonCandidatesFn = () => getPythonCandidates(runCmdFn),
  } = deps;

  return async function diagnosticsHandler(req, res) {
    const root = req.app.locals.freecadRoot;
    const checks = [];
    let hasFailure = false;
    let hasWarning = false;

    const rootExists = await checkExistsFn(root);
    checks.push({
      id: 'freecadRoot',
      label: 'FreeCAD Automation',
      status: rootExists ? 'pass' : 'fail',
      detail: rootExists ? root : 'Directory not found',
    });
    if (!rootExists) hasFailure = true;

    const wslpath = await runCmdFn('which', ['wslpath']);
    checks.push({
      id: 'wslpath',
      label: 'WSL Path Utility',
      status: wslpath ? 'pass' : 'warn',
      detail: wslpath || 'Not found (non-WSL environment)',
    });
    if (!wslpath) hasWarning = true;

    const pythonCandidates = await getPythonCandidatesFn();
    let pythonExe = null;
    let pyVersion = null;
    for (const candidate of pythonCandidates) {
      const version = await runCmdFn(candidate, ['--version']);
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

    let fcVersion = null;
    let fcPythonExe = pythonExe;
    for (const candidate of pythonCandidates) {
      const version = await runCmdFn(candidate, ['-c', 'import FreeCAD; print(FreeCAD.Version()[0] + "." + FreeCAD.Version()[1])']);
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

    const scriptsDir = join(root, 'scripts');
    const missing = [];
    for (const scriptName of REQUIRED_SCRIPTS) {
      if (!(await checkExistsFn(join(scriptsDir, scriptName)))) missing.push(scriptName);
    }
    checks.push({
      id: 'scripts',
      label: 'Analysis Scripts',
      status: missing.length === 0 ? 'pass' : 'fail',
      detail: missing.length === 0 ? `${REQUIRED_SCRIPTS.length} scripts found` : `Missing: ${missing.join(', ')}`,
    });
    if (missing.length > 0) hasFailure = true;

    const outputDir = join(root, 'output');
    const outExists = await checkExistsFn(outputDir);
    const outWritable = outExists && await checkWritableFn(outputDir);
    checks.push({
      id: 'outputDir',
      label: 'Output Directory',
      status: outWritable ? 'pass' : outExists ? 'warn' : 'fail',
      detail: outWritable ? outputDir : outExists ? 'Not writable' : 'Directory not found',
    });
    if (!outExists) hasFailure = true;
    else if (!outWritable) hasWarning = true;

    const overall = hasFailure ? 'fail' : hasWarning ? 'warn' : 'pass';
    res.json({ checks, overall });
  };
}

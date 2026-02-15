import { existsSync } from 'node:fs';
import { basename, join, resolve, isAbsolute } from 'node:path';

export function getExportPathByFormat(result = {}, format) {
  if (!result || typeof result !== 'object') return null;

  const directKey = `${format}_path`;
  if (typeof result[directKey] === 'string' && result[directKey]) return result[directKey];

  if (Array.isArray(result.exports)) {
    const found = result.exports.find((entry) => entry?.format === format && typeof entry?.path === 'string');
    if (found?.path) return found.path;
  }

  if (Array.isArray(result.drawing_paths)) {
    const found = result.drawing_paths.find((entry) => entry?.format === format && typeof entry?.path === 'string');
    if (found?.path) return found.path;
  }

  return null;
}

export function toOutputPath(candidatePath, roots = [], cwd = process.cwd()) {
  if (!candidatePath || typeof candidatePath !== 'string') return null;

  if (isAbsolute(candidatePath) && existsSync(candidatePath)) {
    return candidatePath;
  }

  const normalized = candidatePath.replaceAll('\\', '/');
  const file = basename(normalized);
  const candidates = [];

  candidates.push(resolve(cwd, normalized));
  candidates.push(join(cwd, 'output', file));

  for (const root of roots) {
    if (!root) continue;
    candidates.push(resolve(root, normalized));
    candidates.push(join(root, 'output', file));
  }

  const seen = new Set();
  for (const path of candidates) {
    if (seen.has(path)) continue;
    seen.add(path);
    if (existsSync(path)) return path;
  }

  return null;
}

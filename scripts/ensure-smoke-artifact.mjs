import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_REASON = 'VERIFY_OR_REFRESH_FAILED_BEFORE_SMOKE_OUTPUT';
export const INVALID_JSON_REASON = 'INVALID_SMOKE_JSON';

export function buildFallbackPayload({
  reason = DEFAULT_REASON,
  source = 'workflow-fallback',
  workflow = process.env.GITHUB_WORKFLOW || 'unknown',
  eventName = process.env.GITHUB_EVENT_NAME || 'unknown',
  runId = process.env.GITHUB_RUN_ID || null,
  runAttempt = process.env.GITHUB_RUN_ATTEMPT || null,
  sha = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString(),
} = {}) {
  return {
    ok: false,
    reason,
    source,
    workflow,
    eventName,
    runId,
    runAttempt,
    sha,
    generatedAt,
  };
}

export async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureSmokeArtifact(targetPath, { metadata = {} } = {}) {
  const resolvedPath = resolve(targetPath);
  const exists = await fileExists(resolvedPath);

  if (exists) {
    try {
      const raw = await readFile(resolvedPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { path: resolvedPath, created: false, reason: 'existing_valid' };
      }
    } catch {
      const fallback = buildFallbackPayload({ ...metadata, reason: INVALID_JSON_REASON });
      await writeFile(resolvedPath, `${JSON.stringify(fallback, null, 2)}\n`, 'utf8');
      return { path: resolvedPath, created: true, reason: INVALID_JSON_REASON };
    }
  }

  const fallback = buildFallbackPayload(metadata);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(fallback, null, 2)}\n`, 'utf8');
  return { path: resolvedPath, created: true, reason: fallback.reason };
}

export async function main(argv = process.argv) {
  const outputPath = argv[2] || process.env.SMOKE_OUTPUT || 'artifacts/smoke-core-summary.json';
  const workflow = argv[3] || process.env.GITHUB_WORKFLOW || 'unknown';
  const source = argv[4] || 'workflow-guard';

  const result = await ensureSmokeArtifact(outputPath, {
    metadata: { workflow, source },
  });

  if (result.created) {
    console.log(`Created fallback smoke artifact: ${result.path} (${result.reason})`);
    return 0;
  }

  console.log(`Smoke artifact already exists: ${result.path}`);
  return 0;
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const exitCode = await main();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

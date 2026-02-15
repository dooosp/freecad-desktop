import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REPO = 'dooosp/freecad-desktop';
const RUN_LIST_FIELDS = 'databaseId,workflowName,headBranch,status,conclusion,displayTitle,createdAt';

export function fetchWorkflowRuns({ repo, limit, exec = execFileSync } = {}) {
  const output = exec(
    'gh',
    [
      'run',
      'list',
      '-R',
      repo,
      '-L',
      limit,
      '--json',
      RUN_LIST_FIELDS,
    ],
    { encoding: 'utf8' }
  );
  return JSON.parse(output);
}

export function runCiStatus({ env = process.env, exec = execFileSync, log = console.log, error = console.error } = {}) {
  const repo = env.GH_REPO || DEFAULT_REPO;
  const limit = String(Number(env.GH_LIMIT || 5));

  try {
    const runs = fetchWorkflowRuns({ repo, limit, exec });

    if (!Array.isArray(runs) || runs.length === 0) {
      log('No workflow runs found.');
      return 0;
    }

    log(`Latest ${runs.length} workflow runs for ${repo}:`);
    for (const run of runs) {
      const status = run.conclusion || run.status || 'unknown';
      log(`- #${run.databaseId} [${status}] ${run.workflowName} (${run.headBranch}) ${run.displayTitle} @ ${run.createdAt}`);
    }
    return 0;
  } catch (err) {
    const details = err?.stderr?.toString?.() || err?.message || 'unknown error';
    error('Failed to query GitHub Actions runs via gh CLI.');
    error(details.trim());
    return 1;
  }
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const exitCode = runCiStatus();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

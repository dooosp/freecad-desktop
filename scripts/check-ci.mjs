import { execFileSync } from 'node:child_process';

const repo = process.env.GH_REPO || 'dooosp/freecad-desktop';
const limit = String(Number(process.env.GH_LIMIT || 5));

try {
  const output = execFileSync(
    'gh',
    [
      'run',
      'list',
      '-R',
      repo,
      '-L',
      limit,
      '--json',
      'databaseId,workflowName,headBranch,status,conclusion,displayTitle,createdAt',
    ],
    { encoding: 'utf8' }
  );

  const runs = JSON.parse(output);

  if (!Array.isArray(runs) || runs.length === 0) {
    console.log('No workflow runs found.');
    process.exit(0);
  }

  console.log(`Latest ${runs.length} workflow runs for ${repo}:`);
  for (const run of runs) {
    const status = run.conclusion || run.status || 'unknown';
    console.log(
      `- #${run.databaseId} [${status}] ${run.workflowName} (${run.headBranch}) ${run.displayTitle} @ ${run.createdAt}`
    );
  }
} catch (error) {
  const details = error?.stderr?.toString?.() || error?.message || 'unknown error';
  console.error('Failed to query GitHub Actions runs via gh CLI.');
  console.error(details.trim());
  process.exit(1);
}

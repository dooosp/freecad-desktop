// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { fetchWorkflowRuns, runCiStatus } from './check-ci.mjs';

describe('check-ci', () => {
  it('calls gh run list with repo/limit and parses JSON output', () => {
    const exec = vi.fn(() => '[{"databaseId":1}]');
    const runs = fetchWorkflowRuns({ repo: 'owner/repo', limit: '3', exec });

    expect(exec).toHaveBeenCalledWith(
      'gh',
      [
        'run',
        'list',
        '-R',
        'owner/repo',
        '-L',
        '3',
        '--json',
        'databaseId,workflowName,headBranch,status,conclusion,displayTitle,createdAt',
      ],
      { encoding: 'utf8' }
    );
    expect(runs).toEqual([{ databaseId: 1 }]);
  });

  it('prints no-runs message and exits with 0 when empty response', () => {
    const logs = [];
    const exitCode = runCiStatus({
      env: { GH_REPO: 'owner/repo', GH_LIMIT: '2' },
      exec: () => '[]',
      log: (line) => logs.push(line),
      error: vi.fn(),
    });

    expect(exitCode).toBe(0);
    expect(logs).toEqual(['No workflow runs found.']);
  });

  it('prints workflow run lines with conclusion/status fallback', () => {
    const logs = [];
    const payload = JSON.stringify([
      {
        databaseId: 11,
        workflowName: 'Desktop CI',
        headBranch: 'main',
        status: 'in_progress',
        conclusion: null,
        displayTitle: 'build',
        createdAt: '2026-02-15T03:00:00Z',
      },
      {
        databaseId: 12,
        workflowName: 'Desktop CI',
        headBranch: 'main',
        status: null,
        conclusion: null,
        displayTitle: 'build-2',
        createdAt: '2026-02-15T03:10:00Z',
      },
    ]);

    const exitCode = runCiStatus({
      env: { GH_REPO: 'owner/repo', GH_LIMIT: '2' },
      exec: () => payload,
      log: (line) => logs.push(line),
      error: vi.fn(),
    });

    expect(exitCode).toBe(0);
    expect(logs[0]).toBe('Latest 2 workflow runs for owner/repo:');
    expect(logs[1]).toContain('#11 [in_progress] Desktop CI (main) build @ 2026-02-15T03:00:00Z');
    expect(logs[2]).toContain('#12 [unknown] Desktop CI (main) build-2 @ 2026-02-15T03:10:00Z');
  });

  it('prints stderr details and exits with 1 on gh failure', () => {
    const errors = [];
    const err = new Error('ignored');
    err.stderr = { toString: () => '  bad token  ' };

    const exitCode = runCiStatus({
      env: { GH_REPO: 'owner/repo', GH_LIMIT: '2' },
      exec: () => {
        throw err;
      },
      log: vi.fn(),
      error: (line) => errors.push(line),
    });

    expect(exitCode).toBe(1);
    expect(errors[0]).toBe('Failed to query GitHub Actions runs via gh CLI.');
    expect(errors[1]).toBe('bad token');
  });

  it('falls back to unknown error text when error payload is missing', () => {
    const errors = [];
    const exitCode = runCiStatus({
      env: {},
      exec: () => {
        throw {};
      },
      log: vi.fn(),
      error: (line) => errors.push(line),
    });

    expect(exitCode).toBe(1);
    expect(errors[1]).toBe('unknown error');
  });
});

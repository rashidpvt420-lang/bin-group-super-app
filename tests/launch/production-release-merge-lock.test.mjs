import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RELEASE_WORKFLOW_PATHS,
  selectActiveReleaseRuns,
  verifyProductionReleaseMergeLock,
} from '../../scripts/verify-production-release-merge-lock.mjs';

const repository = 'rashidpvt420-lang/bin-group-super-app';
const token = 'test-token';

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

function workflowNameFromUrl(url) {
  const marker = '/actions/workflows/';
  const start = url.indexOf(marker);
  const encoded = url.slice(start + marker.length, url.indexOf('/runs?', start));
  return decodeURIComponent(encoded);
}

test('release merge lock covers every workflow that can own the production release window', () => {
  assert.deepEqual(RELEASE_WORKFLOW_PATHS, [
    'bank-pilot-dispatch.yml',
    'firebase-production-dispatch-current-main.yml',
    'firebase-production-deploy.yml',
    'founder-release-orchestrator-one-shot.yml',
  ]);
});

test('completed release runs do not lock ordinary main PR validation', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return response({
      workflow_runs: [
        { id: 1, status: 'completed', conclusion: 'success', head_sha: 'a'.repeat(40) },
        { id: 2, status: 'completed', conclusion: 'failure', head_sha: 'b'.repeat(40) },
      ],
    });
  };

  const result = await verifyProductionReleaseMergeLock({ repository, token, fetchImpl });
  assert.deepEqual(result, { locked: false, activeRuns: [] });
  assert.equal(calls.length, RELEASE_WORKFLOW_PATHS.length);
});

test('any queued or in-progress release-control run locks required PR validation', async () => {
  const activeWorkflow = 'firebase-production-deploy.yml';
  const fetchImpl = async (url) => {
    const workflow = workflowNameFromUrl(url);
    return response({
      workflow_runs: workflow === activeWorkflow
        ? [{ id: 35056830876, status: 'in_progress', head_sha: '0'.repeat(40), html_url: 'https://example.invalid/run' }]
        : [],
    });
  };

  await assert.rejects(
    verifyProductionReleaseMergeLock({ repository, token, fetchImpl }),
    /Production release control plane is active \(firebase-production-deploy\.yml#35056830876:in_progress\)/,
  );
});

test('queued bank-pilot and orchestrator runs also hold the merge lock', async () => {
  const active = new Map([
    ['bank-pilot-dispatch.yml', [{ id: 11, status: 'queued' }]],
    ['founder-release-orchestrator-one-shot.yml', [{ id: 12, status: 'in_progress' }]],
  ]);
  const fetchImpl = async (url) => response({ workflow_runs: active.get(workflowNameFromUrl(url)) ?? [] });

  await assert.rejects(
    verifyProductionReleaseMergeLock({ repository, token, fetchImpl }),
    /bank-pilot-dispatch\.yml#11:queued, founder-release-orchestrator-one-shot\.yml#12:in_progress/,
  );
});

test('malformed Actions payload fails closed instead of treating the release window as clear', async () => {
  const fetchImpl = async () => response({ unexpected: [] });

  await assert.rejects(
    verifyProductionReleaseMergeLock({ repository, token, fetchImpl }),
    /invalid workflow_runs payload/,
  );
});

test('GitHub API lookup failures fail closed', async () => {
  const fetchImpl = async () => response({}, { ok: false, status: 503 });

  await assert.rejects(
    verifyProductionReleaseMergeLock({ repository, token, fetchImpl }),
    /GitHub Actions lookup failed with HTTP 503/,
  );
});

test('active-run selector ignores completed records and retains safe diagnostics only', () => {
  assert.deepEqual(
    selectActiveReleaseRuns('firebase-production-deploy.yml', [
      { id: 1, status: 'completed', head_sha: 'a'.repeat(40) },
      { id: 2, status: 'queued', head_sha: 'b'.repeat(40), html_url: 'https://example.invalid/2' },
    ]),
    [{
      workflowPath: 'firebase-production-deploy.yml',
      id: '2',
      status: 'queued',
      headSha: 'b'.repeat(40),
      htmlUrl: 'https://example.invalid/2',
    }],
  );
});

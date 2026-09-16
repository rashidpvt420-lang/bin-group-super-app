import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RELEASE_WORKFLOW_PATHS,
  isCanonicalOwnerDispatchPr,
  selectActiveReleaseRuns,
  verifyProductionReleaseMergeLock,
  verifyReleaseStartHasNoOpenWorkPr,
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

function ownerDispatchPr(overrides = {}) {
  return {
    number: 1234,
    draft: true,
    title: 'Dispatch protected bank pilot workflow',
    user: { login: 'rashidpvt420-lang' },
    base: {
      ref: 'main',
      repo: { full_name: repository },
    },
    head: {
      ref: 'ops/dispatch-bank-pilot-workflow-20260916-example',
      repo: { full_name: repository },
    },
    ...overrides,
  };
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
    /GitHub lookup failed with HTTP 503/,
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

test('only the canonical draft Owner bank-pilot request is exempt from the release-start PR freeze', () => {
  assert.equal(isCanonicalOwnerDispatchPr(ownerDispatchPr(), 'rashidpvt420-lang'), true);
  assert.equal(isCanonicalOwnerDispatchPr(ownerDispatchPr({ draft: false }), 'rashidpvt420-lang'), false);
  assert.equal(isCanonicalOwnerDispatchPr(ownerDispatchPr({ title: 'Ordinary product repair' }), 'rashidpvt420-lang'), false);
  assert.equal(
    isCanonicalOwnerDispatchPr(ownerDispatchPr({ head: { ref: 'feature/ordinary', repo: { full_name: repository } } }), 'rashidpvt420-lang'),
    false,
  );
});

test('production release start accepts only canonical Owner dispatch PRs', async () => {
  const fetchImpl = async () => response([ownerDispatchPr()]);
  const result = await verifyReleaseStartHasNoOpenWorkPr({ repository, token, fetchImpl });
  assert.deepEqual(result, { clear: true, allowedOwnerDispatchPulls: 1 });
});

test('production release start refuses any ordinary open PR to main', async () => {
  const fetchImpl = async () => response([
    ownerDispatchPr(),
    ownerDispatchPr({
      number: 1237,
      draft: false,
      title: 'Harden diagnostics',
      head: { ref: 'fix/diagnostics', repo: { full_name: repository } },
    }),
  ]);

  await assert.rejects(
    verifyReleaseStartHasNoOpenWorkPr({ repository, token, fetchImpl }),
    /ordinary pull requests to main are open \(#1237:fix\/diagnostics\)/,
  );
});

test('malformed open-PR lookup fails closed', async () => {
  const fetchImpl = async () => response({ not: 'an array' });
  await assert.rejects(
    verifyReleaseStartHasNoOpenWorkPr({ repository, token, fetchImpl }),
    /invalid open-pull-request payload/,
  );
});

test(
  'required PR validation fails closed while the production release control plane is active',
  { skip: process.env.GITHUB_EVENT_NAME !== 'pull_request' },
  async () => {
    await verifyProductionReleaseMergeLock({ repository: process.env.GITHUB_REPOSITORY });
  },
);

test(
  'Firebase Production Deploy validation refuses to start with ordinary main PRs open',
  {
    skip:
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
      || process.env.GITHUB_WORKFLOW !== 'Firebase Production Deploy',
  },
  async () => {
    await verifyReleaseStartHasNoOpenWorkPr({ repository: process.env.GITHUB_REPOSITORY });
  },
);

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectNewExactShaWorkflowRun } from '../../scripts/select-new-exact-sha-workflow-run.mjs';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

function run(overrides = {}) {
  const id = overrides.id ?? 9001;
  return {
    id,
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: SHA,
    created_at: '2026-07-23T20:00:00Z',
    html_url: `https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/${id}`,
    actor: { login: 'unexpected-dispatch-actor' },
    ...overrides,
  };
}

test('selector returns the one new exact-SHA run without actor or timestamp assumptions', () => {
  const selected = selectNewExactShaWorkflowRun({
    expectedSha: SHA,
    baselineRunIds: [8001, 8002],
    runs: [
      run({ id: 8001, actor: { login: 'rashidpvt420-lang' } }),
      run({ id: 9001, actor: { login: 'github-actions[bot]' } }),
    ],
  });

  assert.deepEqual(selected, {
    runId: '9001',
    runSha: SHA,
    runUrl: 'https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/9001',
    createdAt: '2026-07-23T20:00:00Z',
  });
});

test('selector supports delayed workflow visibility by returning null until a new run appears', () => {
  assert.equal(selectNewExactShaWorkflowRun({
    expectedSha: SHA,
    baselineRunIds: [8001],
    runs: [run({ id: 8001 })],
  }), null);

  assert.equal(selectNewExactShaWorkflowRun({
    expectedSha: SHA,
    baselineRunIds: [8001],
    runs: [run({ id: 8001 }), run({ id: 9001, created_at: '2026-07-23T20:04:59Z' })],
  })?.runId, '9001');
});

test('selector excludes stale baseline runs and unrelated workflow records', () => {
  const selected = selectNewExactShaWorkflowRun({
    expectedSha: SHA,
    baselineRunIds: [8001],
    runs: [
      run({ id: 8001 }),
      run({ id: 9002, head_sha: OTHER_SHA }),
      run({ id: 9003, event: 'push' }),
      run({ id: 9004, head_branch: 'release' }),
      run({ id: 9005 }),
    ],
  });

  assert.equal(selected?.runId, '9005');
});

test('selector fails closed when more than one new exact-SHA run is observed', () => {
  assert.throws(() => selectNewExactShaWorkflowRun({
    expectedSha: SHA,
    baselineRunIds: [],
    runs: [
      run({ id: 9001, created_at: '2026-07-23T20:00:00Z' }),
      run({ id: 9002, created_at: '2026-07-23T20:00:01Z' }),
    ],
  }), /Ambiguous exact-SHA workflow correlation/);
});

test('selector rejects malformed newly observed exact-SHA metadata', () => {
  assert.throws(() => selectNewExactShaWorkflowRun({
    expectedSha: SHA,
    baselineRunIds: [],
    runs: [run({ id: 'not-a-run-id' })],
  }), /positive GitHub Actions run ID/);

  assert.throws(() => selectNewExactShaWorkflowRun({
    expectedSha: SHA,
    baselineRunIds: [],
    runs: [run({ id: 9001, html_url: 'https://example.com/actions/runs/9001' })],
  }), /malformed html_url/);

  assert.throws(() => selectNewExactShaWorkflowRun({
    expectedSha: SHA,
    baselineRunIds: [],
    runs: [run({ id: 9001, created_at: 'not-a-timestamp' })],
  }), /invalid created_at/);
});

test('owner launch workflow snapshots paginated baselines and dispatches each protected wrapper once', async () => {
  const [workflow, helper] = await Promise.all([
    readFile(new URL('../../.github/workflows/owner-launch-command.yml', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/owner-launch-run-correlation.sh', import.meta.url), 'utf8'),
  ]);

  assert.match(workflow, /Checkout exact current main/);
  assert.match(workflow, /Use Node\.js 22/);
  assert.match(workflow, /owner_snapshot_workflow_run_ids/);
  assert.match(workflow, /owner_locate_new_exact_sha_workflow_run/);
  assert.match(workflow, /private-hr-baseline-run-ids\.json/);
  assert.match(workflow, /bank-pilot-wrapper-baseline-run-ids\.json/);
  assert.match(workflow, /firebase-production-baseline-run-ids\.json/);
  assert.match(workflow, /No duplicate dispatch was attempted/);
  assert.doesNotMatch(workflow, /created_at >= \$started/);
  assert.doesNotMatch(workflow, /\.actor\.login/);
  assert.doesNotMatch(workflow, /per_page=50/);

  assert.match(helper, /gh api --paginate --slurp/);
  assert.match(helper, /per_page=100/);
  assert.match(helper, /select-new-exact-sha-workflow-run\.mjs/);

  assert.equal(
    (workflow.match(/private-hr-migration-dispatch-current-main\.yml\/dispatches/g) || []).length,
    1,
    'Private-HR wrapper must be dispatched exactly once per owner-command run',
  );
  assert.equal(
    (workflow.match(/firebase-production-dispatch-current-main\.yml\/dispatches/g) || []).length,
    1,
    'bank-pilot wrapper must be dispatched exactly once per owner-command run',
  );
});

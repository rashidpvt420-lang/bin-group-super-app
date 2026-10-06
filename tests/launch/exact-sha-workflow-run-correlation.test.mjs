import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
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

test('dispatch lower bound excludes two old reviews omitted by a stale baseline', () => {
  const selected = selectNewExactShaWorkflowRun({
    expectedSha: SHA,
    baselineRunIds: [8001],
    notBefore: '2026-10-05T14:41:58Z',
    runs: [
      run({ id: 8001, created_at: '2026-10-05T14:17:48Z' }),
      run({ id: 9001, created_at: '2026-10-05T14:29:47Z' }),
      run({ id: 9002, created_at: '2026-10-05T14:39:22Z' }),
      run({ id: 9003, created_at: '2026-10-05T14:41:59Z' }),
    ],
  });
  assert.equal(selected?.runId, '9003');
});

test('dispatch lower bound keeps baseline exclusion and fails closed on new ambiguity', () => {
  const options = {
    expectedSha: SHA,
    baselineRunIds: [9001],
    notBefore: '2026-07-23T20:00:00Z',
  };
  assert.equal(selectNewExactShaWorkflowRun({
    ...options,
    runs: [run({ id: 9001 }), run({ id: 9002, created_at: '2026-07-23T19:59:59Z' })],
  }), null);
  assert.equal(selectNewExactShaWorkflowRun({
    ...options,
    runs: [run({ id: 9001 }), run({ id: 9002 })],
  })?.runId, '9002');
  assert.throws(() => selectNewExactShaWorkflowRun({
    ...options,
    runs: [run({ id: 9002 }), run({ id: 9003, created_at: '2026-07-23T20:00:01Z' })],
  }), /Ambiguous exact-SHA workflow correlation/);
});

test('invalid dispatch lower bounds fail closed', () => {
  for (const notBefore of ['', 'invalid-date']) {
    assert.throws(() => selectNewExactShaWorkflowRun({
      expectedSha: SHA,
      baselineRunIds: [],
      notBefore,
      runs: [run()],
    }), /invalid created_at/);
  }
});

test('identical paginated run records are deduplicated but conflicting provenance fails closed', () => {
  const options = { expectedSha: SHA, baselineRunIds: [] };
  assert.equal(selectNewExactShaWorkflowRun({
    ...options, runs: [run(), run({ status: 'completed' })],
  })?.runId, '9001');
  assert.throws(() => selectNewExactShaWorkflowRun({
    ...options, runs: [run(), run({ created_at: '2026-07-23T20:00:01Z' })],
  }), /Conflicting provenance/);
});

test('real CLI forwards the optional dispatch bound and preserves exit statuses', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cleanup-correlation-'));
  const baseline = join(directory, 'baseline.json');
  writeFileSync(baseline, '[]');
  const selector = fileURLToPath(new URL('../../scripts/select-new-exact-sha-workflow-run.mjs', import.meta.url));
  const execute = (runs, bound) => spawnSync(process.execPath,
    [selector, SHA, baseline, ...(bound === undefined ? [] : [bound])],
    { input: JSON.stringify(runs), encoding: 'utf8' });
  try {
    assert.equal(execute([run()]).status, 0);
    const runs = [run(), run({ id: 9002, created_at: '2026-07-23T20:05:01Z' })];
    const selected = execute(runs, '2026-07-23T20:05:00Z');
    assert.equal(selected.status, 0, selected.stderr);
    assert.equal(JSON.parse(selected.stdout).runId, '9002');
    assert.equal(execute([run()], '2026-07-23T20:05:00Z').status, 2);
    assert.equal(execute(runs).status, 1);
    assert.equal(execute([run()], 'invalid').status, 1);

    const shell = spawnSync('bash', ['-c', `
      source scripts/owner-launch-run-correlation.sh
      gh() { printf '%s' "$FAKE_PAGES"; }
      owner_locate_new_exact_sha_workflow_run privileged-account-cleanup-dry-run.yml "$EXPECTED_SHA" "$1" 1 0 '2026-07-23T20:05:00Z'
    `, 'test', baseline], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      env: { ...process.env, REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
        EXPECTED_SHA: SHA, FAKE_PAGES: JSON.stringify([{ workflow_runs: runs }]) },
      encoding: 'utf8',
    });
    assert.equal(shell.status, 0, shell.stderr);
    assert.equal(JSON.parse(shell.stdout).runId, '9002');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('all five frozen evidence scopes accept only the reviewed cleanup control paths', async () => {
  const workflows = ['live-role-smoke', 'operational-application-evidence',
    'operational-provider-evidence', 'privileged-access-rotation-evidence', 'technician-physical-evidence'];
  const reviewedPaths = ['scripts/owner-launch-run-correlation.sh',
    'scripts/select-new-exact-sha-workflow-run.mjs',
    'tests/launch/exact-sha-workflow-run-correlation.test.mjs',
    '.github/workflows/owner-privileged-cleanup-command.yml'];
  for (const name of workflows) {
    const workflow = await readFile(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
    const match = workflow.match(/supplemental_allowed='([^'\n]+)'/);
    assert.ok(match, name);
    const acceptedByBashScope = (path) => {
      const result = spawnSync('bash', ['-c', '[[ "$1" =~ $SCOPE_PATTERN ]]', 'scope-test', path], {
        env: { ...process.env, SCOPE_PATTERN: match[1] }, encoding: 'utf8',
      });
      assert.ok(result.status === 0 || result.status === 1, result.stderr);
      return result.status === 0;
    };
    for (const path of reviewedPaths) assert.ok(acceptedByBashScope(path), `${name}: ${path}`);
    for (const path of ['src/lib/firebase.ts', 'firestore.rules', 'functions/src/index.ts',
      'scripts/select-new-exact-sha-workflow-run.mjs.extra',
      '.github/workflows/privileged-account-cleanup-production.yml']) {
      assert.equal(acceptedByBashScope(path), false, `${name}: ${path}`);
    }
  }
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

test('owner launch workflow snapshots and dispatches one exact-SHA privileged review', async () => {
  const [workflow, helper] = await Promise.all([
    readFile(new URL('../../.github/workflows/owner-launch-command.yml', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/owner-launch-run-correlation.sh', import.meta.url), 'utf8'),
  ]);

  assert.match(workflow, /Checkout exact current main/);
  assert.match(workflow, /Use Node\.js 22/);
  assert.match(workflow, /owner_snapshot_workflow_run_ids/);
  assert.match(workflow, /owner_locate_new_exact_sha_workflow_run/);
  assert.match(workflow, /privileged-review-baseline-run-ids\.json/);
  assert.match(workflow, /No duplicate dispatch was attempted/);
  assert.doesNotMatch(workflow, /created_at >= \$started/);
  assert.doesNotMatch(workflow, /\.actor\.login/);
  assert.doesNotMatch(workflow, /per_page=50/);

  assert.match(helper, /gh api --paginate --slurp/);
  assert.match(helper, /per_page=100/);
  assert.match(helper, /select-new-exact-sha-workflow-run\.mjs/);

  assert.equal(
    (workflow.match(/privileged-account-cleanup-dry-run\.yml\/dispatches/g) || []).length,
    1,
    'privileged review must be dispatched exactly once per owner-command run',
  );
  assert.equal(
    (workflow.match(/private-hr-migration-dispatch-current-main\.yml\/dispatches/g) || []).length,
    0,
    'Private-HR must be left to the protected draft-PR dispatcher',
  );
  assert.equal(
    (workflow.match(/firebase-production-dispatch-current-main\.yml\/dispatches/g) || []).length,
    0,
    'production must be left to the protected draft-PR dispatcher',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectProductionDiagnosisRun } from '../../scripts/select-production-diagnosis-run.mjs';

const workflow = await readFile(
  new URL('../../.github/workflows/owner-production-diagnosis.yml', import.meta.url),
  'utf8',
);

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const FIXTURE_MAIN_SHA = 'a'.repeat(40);
const FIXTURE_OTHER_SHA = 'b'.repeat(40);
const NOW = Date.now();

/**
 * Build a minimal canonical eligible run fixture.
 * All defaults produce a run that is eligible and matches FIXTURE_MAIN_SHA.
 */
function run({
  id = 1,
  head_sha = FIXTURE_MAIN_SHA,
  html_url = `https://github.com/owner/repo/actions/runs/1`,
  created_at = new Date(NOW - 3_600_000).toISOString(), // 1 h ago
  conclusion = 'failure',
  status = 'completed',
  event = 'workflow_dispatch',
  name = 'Firebase Production Deploy',
  path = '.github/workflows/firebase-production-deploy.yml',
} = {}) {
  return { id, head_sha, html_url, created_at, conclusion, status, event, name, path };
}

function selectRun(mainSha, runs) {
  return selectProductionDiagnosisRun(mainSha, runs, { now: NOW });
}

// ─── Static workflow-structure checks ─────────────────────────────────────────

test('manual production diagnosis is owner-only and canonical-issue-only', () => {
  assert.match(workflow, /issue_comment:\s*\n\s*types:\s*\[created\]/);
  assert.match(workflow, /github\.event\.issue\.number == 434/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(workflow, /github\.event\.comment\.body == '\/bin-launch diagnose-latest-deploy'/);
  assert.doesNotMatch(workflow, /actions:\s*write/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
});

test('diagnosis uses CLI pagination and delegates selection to testable script', () => {
  assert.match(workflow, /repos\/\$REPOSITORY\/git\/ref\/heads\/main/);
  assert.match(workflow, /Unable to resolve the current main branch SHA/);
  assert.match(workflow, /gh api --paginate --slurp/);
  assert.match(workflow, /jq -c '\[\.?\[\]\.workflow_runs\[\]\]'/);
  assert.match(workflow, /select-production-diagnosis-run\.mjs/);
  assert.match(workflow, /No completed failed Firebase Production Deploy run was found/);
  assert.match(workflow, /Missing run_id diagnostic metadata/);
  assert.match(workflow, /Malformed run_sha diagnostic metadata/);
  assert.match(workflow, /Malformed run_url diagnostic metadata/);
  assert.match(workflow, /Source run is stale failure:/);
  assert.match(workflow, /sourceRunMatchesResolvedMainSha/);
  assert.match(workflow, /sourceRunStaleFailureEvidence/);
  assert.match(workflow, /resolvedMainSha/);
  assert.doesNotMatch(workflow, /latest failed production run is outside the 24-hour diagnostic window/);
  assert.doesNotMatch(workflow, /for page in \$\(seq/);
  assert.doesNotMatch(workflow, /while \(\( page <= max_pages \)\)/);
});

test('diagnosis uploads masked logs but posts only normalized redacted lines', () => {
  assert.match(workflow, /actions\/jobs\/\$job_id\/logs/);
  assert.match(workflow, /githubSecretMaskingApplied:\s*true/);
  assert.match(workflow, /personalIdentifiersRedacted:\s*true/);
  assert.match(workflow, /<redacted-email>/);
  assert.match(workflow, /<redacted-id>/);
  assert.match(workflow, /<redacted-provider-id>/);
  assert.match(workflow, /<redacted-secret>/);
  assert.match(workflow, /normalizedErrorLines/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /hardLaunchClaim:\s*false/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test('diagnosis captures Playwright suite, test and assertion context', () => {
  assert.match(workflow, /\\\[critical-evidence\\\]/);
  assert.match(workflow, /business-\(\?:admin\|owner\|tenant\|technician\|broker\|global\)/);
  assert.match(workflow, /tests\\\/e2e\\\/\[\^\\s\]\+\\\.spec\\\.ts/);
  assert.match(workflow, /strict mode violation/);
  assert.match(workflow, /failedSuiteSignals/);
  assert.match(workflow, /Failed suite signals/);
  assert.match(workflow, /for \(let offset = -2; offset <= 2; offset \+= 1\)/);
  assert.match(workflow, /slice\(-80\)/);
});

// ─── Behavioral tests for selectProductionDiagnosisRun ───────────────────────

test('current-main failure preferred over newer old-SHA failure', () => {
  const olderMainRun = run({
    id: 1,
    head_sha: FIXTURE_MAIN_SHA,
    html_url: 'https://github.com/owner/repo/actions/runs/1',
    created_at: new Date(NOW - 7_200_000).toISOString(), // 2 h ago (older)
  });
  const newerOtherRun = run({
    id: 2,
    head_sha: FIXTURE_OTHER_SHA,
    html_url: 'https://github.com/owner/repo/actions/runs/2',
    created_at: new Date(NOW - 1_800_000).toISOString(), // 30 min ago (newer)
  });
  const result = selectRun(FIXTURE_MAIN_SHA, [newerOtherRun, olderMainRun]);
  assert.equal(result.runId, 1);
  assert.equal(result.matchesCurrentMain, true);
});

test('newest relevant fallback when current main has no failure', () => {
  const olderOtherRun = run({
    id: 10,
    head_sha: FIXTURE_OTHER_SHA,
    html_url: 'https://github.com/owner/repo/actions/runs/10',
    created_at: new Date(NOW - 7_200_000).toISOString(), // 2 h ago
  });
  const newerOtherRun = run({
    id: 11,
    head_sha: FIXTURE_OTHER_SHA,
    html_url: 'https://github.com/owner/repo/actions/runs/11',
    created_at: new Date(NOW - 3_600_000).toISOString(), // 1 h ago (newest)
  });
  const result = selectRun(FIXTURE_MAIN_SHA, [olderOtherRun, newerOtherRun]);
  assert.equal(result.runId, 11);
  assert.equal(result.matchesCurrentMain, false);
});

test('failure older than 24 hours remains diagnosable and is marked stale', () => {
  const staleRun = run({
    id: 20,
    head_sha: FIXTURE_MAIN_SHA,
    html_url: 'https://github.com/owner/repo/actions/runs/20',
    created_at: new Date(NOW - 90_000_000).toISOString(), // ~25 h ago
  });
  const result = selectRun(FIXTURE_MAIN_SHA, [staleRun]);
  assert.equal(result.runId, 20);
  assert.equal(result.staleEvidence, true);
  assert.ok(result.ageSeconds > 86400);
});

test('failures found after the first API page are considered', () => {
  // Simulate 150 runs (beyond a 100-run first page); eligible run is the last.
  const filler = Array.from({ length: 149 }, (_, i) =>
    run({
      id: 100 + i,
      head_sha: FIXTURE_OTHER_SHA,
      html_url: `https://github.com/owner/repo/actions/runs/${100 + i}`,
      created_at: new Date(NOW - (200 - i) * 60_000).toISOString(),
    }),
  );
  const expectedRun = run({
    id: 999,
    head_sha: FIXTURE_MAIN_SHA,
    html_url: 'https://github.com/owner/repo/actions/runs/999',
    created_at: new Date(NOW - 60_000).toISOString(), // newest
  });
  const result = selectRun(FIXTURE_MAIN_SHA, [...filler, expectedRun]);
  assert.equal(result.runId, 999);
  assert.equal(result.matchesCurrentMain, true);
});

test('unrelated workflows are excluded', () => {
  const unrelated = run({
    id: 30,
    name: 'Some Other Workflow',
    path: '.github/workflows/other.yml',
  });
  assert.throws(
    () => selectRun(FIXTURE_MAIN_SHA, [unrelated]),
    /No completed failed Firebase Production Deploy run was found/,
  );
});

test('successful and cancelled runs are excluded', () => {
  const success = run({ id: 40, conclusion: 'success' });
  const cancelled = run({ id: 41, conclusion: 'cancelled' });
  assert.throws(
    () => selectRun(FIXTURE_MAIN_SHA, [success, cancelled]),
    /No completed failed Firebase Production Deploy run was found/,
  );
});

test('malformed run ID is rejected', () => {
  const bad = run({ id: 'not-a-number' });
  assert.throws(
    () => selectRun(FIXTURE_MAIN_SHA, [bad]),
    /No completed failed Firebase Production Deploy run was found/,
  );
});

test('malformed SHA is rejected', () => {
  const bad = run({ head_sha: 'tooshort' });
  assert.throws(
    () => selectRun(FIXTURE_MAIN_SHA, [bad]),
    /No completed failed Firebase Production Deploy run was found/,
  );
});

test('malformed URL is rejected', () => {
  const bad = run({ html_url: 'not-a-url' });
  assert.throws(
    () => selectRun(FIXTURE_MAIN_SHA, [bad]),
    /No completed failed Firebase Production Deploy run was found/,
  );
});

test('malformed timestamp is rejected', () => {
  const bad = run({ created_at: 'not-a-date' });
  assert.throws(
    () => selectRun(FIXTURE_MAIN_SHA, [bad]),
    /No completed failed Firebase Production Deploy run was found/,
  );
});

test('empty eligible set fails closed', () => {
  assert.throws(
    () => selectRun(FIXTURE_MAIN_SHA, []),
    /No completed failed Firebase Production Deploy run was found/,
  );
});

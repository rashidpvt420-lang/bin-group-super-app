import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectProductionDiagnosisRun } from '../../scripts/select-production-diagnosis-run.mjs';

const workflow = await readFile(
  new URL('../../.github/workflows/owner-production-diagnosis.yml', import.meta.url),
  'utf8',
);

const MAIN_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const NOW = Date.now();

function run({
  id = 1,
  head_sha = MAIN_SHA,
  html_url = 'https://github.com/owner/repo/actions/runs/1',
  created_at = new Date(NOW - 3_600_000).toISOString(),
  conclusion = 'failure',
  status = 'completed',
  event = 'workflow_dispatch',
  name = 'Firebase Production Deploy',
  path = '.github/workflows/firebase-production-deploy.yml',
} = {}) {
  return { id, head_sha, html_url, created_at, conclusion, status, event, name, path };
}

const select = (runs, mainSha = MAIN_SHA) =>
  selectProductionDiagnosisRun(mainSha, runs, { now: NOW });

test('diagnosis uses an always-visible router and gates every privileged step', () => {
  assert.match(workflow, /issue_comment:\s*\n\s*types:\s*\[created\]/);
  const jobHeader = workflow.match(/\n  diagnose:\n(?<header>[\s\S]*?)\n    steps:/)?.groups?.header || '';
  assert.doesNotMatch(jobHeader, /^\s+if:/m);
  assert.match(workflow, /name: Route canonical owner diagnosis command/);
  assert.match(workflow, /id: auth/);
  assert.match(workflow, /EVENT_ISSUE_NUMBER: \$\{\{ github\.event\.issue\.number \}\}/);
  assert.match(workflow, /echo 'authorized=false' >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /Ignoring unrelated issue comment; no production diagnosis was requested/);
  assert.match(workflow, /COMMENT_BODY.*\/bin-launch diagnose-latest-deploy/s);
  assert.match(workflow, /COMMENT_ACTOR: \$\{\{ github\.event\.comment\.user\.login \}\}/);
  assert.match(workflow, /REPOSITORY_OWNER: \$\{\{ github\.repository_owner \}\}/);
  assert.match(workflow, /\[\[ "\$COMMENT_ACTOR" == "\$REPOSITORY_OWNER" \]\]/);
  assert.match(workflow, /Only the repository owner may run production diagnosis/);
  assert.match(workflow, /repos\/\$REPOSITORY\/issues\/\$ISSUE_NUMBER/);
  assert.match(workflow, /has\("pull_request"\) \| not/);
  assert.match(workflow, /echo 'authorized=true' >> "\$GITHUB_OUTPUT"/);
  const guardedSteps = workflow.match(/if: steps\.auth\.outputs\.authorized == 'true'/g) || [];
  assert.ok(guardedSteps.length >= 6, `expected at least 6 guarded diagnostic steps, found ${guardedSteps.length}`);
  assert.doesNotMatch(workflow, /actions:\s*write/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
});

test('diagnosis checks out exact current main and uses paginated deterministic run selection', () => {
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /repos\/\$REPOSITORY\/git\/ref\/heads\/main/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /Checked-out SHA .* does not match current main/);
  assert.match(workflow, /gh api --paginate --slurp/);
  assert.match(workflow, /jq -c '\[\.\[\]\.workflow_runs\[\]\]'/);
  assert.match(workflow, /select-production-diagnosis-run\.mjs/);
  assert.match(workflow, /No completed failed Firebase Production Deploy run was found/);
  assert.match(workflow, /Source run is stale failure:/);
  assert.doesNotMatch(workflow, /24-hour diagnostic window/);
});

test('diagnosis uploads only sanitized evidence and captures deployment plus Playwright context', () => {
  assert.match(workflow, /raw_log="\$\(mktemp\)"/);
  assert.match(workflow, /sanitize-production-diagnostic-log\.mjs/);
  assert.match(workflow, /\\\[production-deploy\\\]/);
  assert.match(workflow, /\\\[deploy-verify\\\]/);
  assert.match(workflow, /FirebaseError/);
  assert.match(workflow, /\\\[critical-evidence\\\]/);
  assert.match(workflow, /business-\(\?:admin\|owner\|tenant\|technician\|broker\|global\)/);
  assert.match(workflow, /tests\\\/e2e\\\/\[\^\\s\]\+\\\.spec\\\.ts/);
  assert.match(workflow, /fullArtifactLogRedacted:\s*true/);
  assert.match(workflow, /rawJobLogUploaded:\s*false/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /hardLaunchClaim:\s*false/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test('current-main failure is preferred over a newer old-SHA failure', () => {
  const result = select([
    run({ id: 2, head_sha: OTHER_SHA, html_url: 'https://github.com/o/r/actions/runs/2', created_at: new Date(NOW - 60_000).toISOString() }),
    run({ id: 1, head_sha: MAIN_SHA, html_url: 'https://github.com/o/r/actions/runs/1', created_at: new Date(NOW - 3_600_000).toISOString() }),
  ]);
  assert.equal(result.runId, 1);
  assert.equal(result.matchesCurrentMain, true);
});

test('newest relevant failure is used when current main has no failed run', () => {
  const result = select([
    run({ id: 10, head_sha: OTHER_SHA, html_url: 'https://github.com/o/r/actions/runs/10', created_at: new Date(NOW - 7_200_000).toISOString() }),
    run({ id: 11, head_sha: OTHER_SHA, html_url: 'https://github.com/o/r/actions/runs/11', created_at: new Date(NOW - 3_600_000).toISOString() }),
  ]);
  assert.equal(result.runId, 11);
  assert.equal(result.matchesCurrentMain, false);
});

test('old failures remain diagnosable and are marked stale', () => {
  const result = select([
    run({ id: 20, html_url: 'https://github.com/o/r/actions/runs/20', created_at: new Date(NOW - 90_000_000).toISOString() }),
  ]);
  assert.equal(result.runId, 20);
  assert.equal(result.staleEvidence, true);
  assert.ok(result.ageSeconds > 86_400);
});

test('a current-main failure beyond the first API page remains selectable', () => {
  const filler = Array.from({ length: 149 }, (_, index) =>
    run({
      id: 100 + index,
      head_sha: OTHER_SHA,
      html_url: `https://github.com/o/r/actions/runs/${100 + index}`,
      created_at: new Date(NOW - (200 - index) * 60_000).toISOString(),
    }),
  );
  const result = select([
    ...filler,
    run({ id: 999, head_sha: MAIN_SHA, html_url: 'https://github.com/o/r/actions/runs/999', created_at: new Date(NOW - 60_000).toISOString() }),
  ]);
  assert.equal(result.runId, 999);
});

test('unrelated, successful, cancelled and malformed runs fail closed', () => {
  const invalidSets = [
    [run({ name: 'Other', path: '.github/workflows/other.yml' })],
    [run({ conclusion: 'success' }), run({ id: 2, conclusion: 'cancelled' })],
    [run({ id: 'bad' })],
    [run({ head_sha: 'short' })],
    [run({ html_url: 'not-a-url' })],
    [run({ created_at: 'not-a-date' })],
    [],
  ];
  for (const fixtures of invalidSets) {
    assert.throws(
      () => select(fixtures),
      /No completed failed Firebase Production Deploy run was found/,
    );
  }
});

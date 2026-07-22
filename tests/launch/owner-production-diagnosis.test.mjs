import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(
  new URL('../../.github/workflows/owner-production-diagnosis.yml', import.meta.url),
  'utf8',
);

test('manual production diagnosis is owner-only and canonical-issue-only', () => {
  assert.match(workflow, /issue_comment:\s*\n\s*types:\s*\[created\]/);
  assert.match(workflow, /github\.event\.issue\.number == 434/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(workflow, /github\.event\.comment\.body == '\/bin-launch diagnose-latest-deploy'/);
  assert.doesNotMatch(workflow, /actions:\s*write/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
});

test('diagnosis prioritizes current main SHA and paginates completed failed deploy runs', () => {
  assert.match(workflow, /repos\/\$REPOSITORY\/git\/ref\/heads\/main/);
  assert.match(workflow, /while \(\( page <= max_pages \)\)/);
  assert.match(workflow, /max_pagination_pages=10/);
  assert.match(workflow, /stale_threshold_seconds=86400/);
  assert.match(workflow, /per_page=100&page=\$page/);
  assert.match(workflow, /total_count/);
  assert.match(workflow, /required_pages=\$\(\( \(total_count \+ 99\) \/ 100 \)\)/);
  assert.match(workflow, /workflow_name='Firebase Production Deploy'/);
  assert.match(workflow, /workflow_path='.github\/workflows\/firebase-production-deploy\.yml'/);
  assert.match(workflow, /select\(\.conclusion == "failure"\)/);
  assert.match(workflow, /select\(\.path == \$workflow_path\)/);
  assert.match(workflow, /select\(\(.name \/\/ ""\) == \$workflow_name\)/);
  assert.match(workflow, /select\(\.head_sha == \$main_sha\)/);
  assert.match(workflow, /sha_matched_run/);
  assert.match(workflow, /if \[\[ -n "\$sha_matched_run" \]\]/);
  assert.match(workflow, /run_url" == "https:\/\/github\.com\/\$REPOSITORY\/actions\/runs\/\$run_id"/);
  assert.match(workflow, /Unable to resolve the current main branch SHA/);
  assert.match(workflow, /No completed failed Firebase Production Deploy run was found/);
  assert.match(workflow, /sourceRunMatchesResolvedMainSha/);
  assert.match(workflow, /sourceRunStaleFailureEvidence/);
  assert.match(workflow, /resolvedMainSha/);
  assert.match(workflow, /Missing .* diagnostic metadata/);
  assert.match(workflow, /Malformed .* diagnostic metadata:/);
  assert.match(workflow, /Stale failure evidence preserved:/);
  assert.doesNotMatch(workflow, /latest failed production run is outside the 24-hour diagnostic window/);
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

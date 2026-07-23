import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [command, reviewWorkflow, executeWorkflow] = await Promise.all([
  readFile(new URL('../../.github/workflows/owner-privileged-cleanup-command.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/privileged-account-cleanup-dry-run.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/privileged-account-cleanup-production.yml', import.meta.url), 'utf8'),
]);

test('privileged cleanup command is owner-only and issue-bound', () => {
  assert.match(command, /github\.event\.issue\.number == 434/);
  assert.match(command, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(command, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(command, /'\/bin-launch review-privileged-accounts'/);
  assert.match(command, /'\/bin-launch execute-privileged-cleanup'/);
  assert.doesNotMatch(command, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(command, /continue-on-error:\s*true/);
});

test('fresh exact-SHA review is mandatory before any cleanup', () => {
  assert.match(command, /privileged-account-cleanup-dry-run\.yml\/dispatches/);
  assert.match(command, /expected_commit_sha:\$sha/);
  assert.match(command, /privileged-account-cleanup-review-\$RELEASE_SHA/);
  assert.match(command, /report_path="\$\(find privileged-review -type f -name 'privileged-account-cleanup\.json' -print -quit\)"/);
  assert.match(command, /\[\[ -n "\$report_path" && -s "\$report_path" \]\]/);
  assert.match(command, /\.schemaVersion == 2/);
  assert.match(command, /\.mutationPerformed == false/);
  assert.match(command, /\.deletedAccountCount == 0/);
  assert.match(command, /\.nonPrivilegedAccountsUntouched == true/);
  assert.match(command, /latest_main.*RELEASE_SHA/s);
});

test('destructive cleanup requires canonical founder readiness and reviewed targets', () => {
  assert.match(command, /FOUNDER_READY.*true/s);
  assert.match(command, /EXECUTION_ELIGIBLE.*true/s);
  assert.match(command, /TARGET_COUNT.*\^\[1-9\]\[0-9\]\*\$/s);
  assert.match(command, /EXPECTED_TARGET_COUNT:\s*\$\{\{ steps\.review\.outputs\.target_count \}\}/);
  assert.match(command, /DELETE_ALL_OTHER_PRIVILEGED_ACCOUNTS_BIN_GROUP/);
  assert.match(command, /canonical_founder_email:"ceo@bin-groups\.com"/);
  assert.match(command, /execute_cleanup:true/);
});

test('cleanup waits for success and verifies exact-SHA result artifact against reviewed target count', () => {
  assert.match(command, /cleanup_completed='false'/);
  assert.match(command, /cleanup_completed='true'/);
  assert.match(command, /wait_for_success "\$run_id"/);
  assert.match(command, /privileged-account-cleanup-\$RELEASE_SHA-\$run_id-/);
  assert.match(command, /report_path="\$\(find privileged-cleanup -type f -name 'privileged-account-cleanup\.json' -print -quit\)"/);
  assert.match(command, /\.schemaVersion == 1/);
  assert.match(command, /\.status == "executed"/);
  assert.match(command, /\.commitSha == \$sha/);
  assert.match(command, /\.workflowRunId == \$workflow_run_id/);
  assert.match(command, /\.deletionTargetCount == \$expected/);
  assert.match(command, /\.deletedAccountCount == \$expected/);
  assert.match(command, /\.canonicalFounderReady == true/);
  assert.match(command, /\.auditLogsPreserved == true/);
  assert.match(command, /\.nonPrivilegedAccountsUntouched == true/);
  assert.match(command, /\.hardLaunchClaim == false/);
  assert.match(command, /latest_main.*RELEASE_SHA/s);
});

test('review and execution workflows accept and enforce optional expected SHA', () => {
  for (const workflow of [reviewWorkflow, executeWorkflow]) {
    assert.match(workflow, /^\s+expected_commit_sha:/m);
    assert.match(workflow, /EXPECTED_COMMIT_SHA:\s*\$\{\{ inputs\.expected_commit_sha \}\}/);
    assert.match(workflow, /\[\[ "\$EXPECTED_COMMIT_SHA" == "\$GITHUB_SHA" \]\]/);
    assert.match(workflow, /actions\/checkout@v6/);
    assert.match(workflow, /actions\/setup-node@v6/);
    assert.match(workflow, /google-github-actions\/auth@v3/);
    assert.match(workflow, /actions\/upload-artifact@v7/);
  }
});

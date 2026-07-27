import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [command, reviewWorkflow, executeWorkflow, correlationHelper] = await Promise.all([
  readFile(new URL('../../.github/workflows/owner-privileged-cleanup-command.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/privileged-account-cleanup-dry-run.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/privileged-account-cleanup-production.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/owner-launch-run-correlation.sh', import.meta.url), 'utf8'),
]);

test('single job authorizes exact issue commands before every production step', () => {
  assert.match(command, /jobs:\s*\n\s*review-and-clean:/);
  assert.doesNotMatch(command, /authorize-command:/);
  assert.doesNotMatch(command, /\n\s+needs:/);
  assert.match(command, /name: Authorize exact issue command and resolve main/);
  assert.match(command, /EVENT_NAME:\s*\$\{\{ github\.event_name \}\}/);
  assert.match(command, /EVENT_ISSUE_NUMBER:\s*\$\{\{ github\.event\.issue\.number \}\}/);
  assert.match(command, /PULL_REQUEST_URL:\s*\$\{\{ github\.event\.issue\.pull_request\.url \}\}/);
  assert.match(command, /\[\[ "\$EVENT_NAME" == 'issue_comment' && "\$EVENT_ISSUE_NUMBER" == "\$TARGET_ISSUE_NUMBER" && -z "\$PULL_REQUEST_URL" \]\]/);
  assert.match(command, /\[\[ "\$COMMENT_BODY" == '\/bin-launch review-privileged-accounts' \]\]/);
  assert.equal((command.match(/if: steps\.authorize\.outputs\.authorized == 'true'/g) || []).length, 3);
});

test('read-only review is transport-neutral while destructive cleanup remains owner-only twice', () => {
  assert.match(command, /COMMENT_AUTHOR:\s*\$\{\{ github\.event\.comment\.user\.login \}\}/);
  assert.match(command, /REPOSITORY_OWNER:\s*\$\{\{ github\.repository_owner \}\}/);
  assert.match(command, /COMMENT_BODY" == '\/bin-launch execute-privileged-cleanup'[\s\S]*COMMENT_AUTHOR" == "\$REPOSITORY_OWNER/);
  assert.match(command, /execute='true'/);
  assert.equal((command.match(/if: steps\.authorize\.outputs\.execute == 'true'/g) || []).length, 2);
  assert.match(command, /\[\[ "\$COMMENT_AUTHOR" == "\$REPOSITORY_OWNER" \]\]/);
  assert.doesNotMatch(command, /chatgpt-codex-connector/);
  assert.doesNotMatch(command, /author_association/);
  assert.doesNotMatch(command, /endsWith\([^\n]*\[bot\]/);
  assert.doesNotMatch(command, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(command, /continue-on-error:\s*true/);
});

test('cleanup command checks out exact main and uses shared paginated baseline correlation', () => {
  assert.match(command, /name: Checkout exact current main/);
  assert.match(command, /ref: \$\{\{ steps\.authorize\.outputs\.release_sha \}\}/);
  assert.match(command, /persist-credentials: false/);
  assert.match(command, /node-version: '22'/);
  assert.match(command, /source scripts\/owner-launch-run-correlation\.sh/g);
  assert.match(command, /owner_snapshot_workflow_run_ids[\s\S]*privileged-account-cleanup-dry-run\.yml/);
  assert.match(command, /owner_locate_new_exact_sha_workflow_run[\s\S]*privileged-account-cleanup-dry-run\.yml/);
  assert.match(command, /owner_snapshot_workflow_run_ids[\s\S]*privileged-account-cleanup-production\.yml/);
  assert.match(command, /owner_locate_new_exact_sha_workflow_run[\s\S]*privileged-account-cleanup-production\.yml/);
  assert.match(command, /No duplicate review was attempted/);
  assert.match(command, /No duplicate destructive dispatch was attempted/);
  assert.match(correlationHelper, /gh api --paginate --slurp/);
  assert.match(correlationHelper, /select-new-exact-sha-workflow-run\.mjs/);
  assert.doesNotMatch(command, /created_at >= \$started/);
  assert.doesNotMatch(command, /actor\.login/);
  assert.doesNotMatch(command, /per_page=50/);
  assert.doesNotMatch(command, /started_at=/);
});

test('fresh exact-SHA review is mandatory before any cleanup', () => {
  assert.match(command, /privileged-account-cleanup-dry-run\.yml\/dispatches/);
  assert.equal((command.match(/privileged-account-cleanup-dry-run\.yml\/dispatches/g) || []).length, 1);
  assert.match(command, /expected_commit_sha:\$sha/);
  assert.match(command, /privileged-account-cleanup-review-\$RELEASE_SHA/);
  assert.match(command, /report_path="\$\(find privileged-review -type f -name 'privileged-account-cleanup\.json' -print -quit\)"/);
  assert.match(command, /\[\[ -n "\$report_path" && -s "\$report_path" \]\]/);
  assert.match(command, /\.schemaVersion == 2/);
  assert.match(command, /\.mutationPerformed == false/);
  assert.match(command, /\.deletedAccountCount == 0/);
  assert.match(command, /\.nonPrivilegedAccountsUntouched == true/);
  assert.match(command, /gh api --paginate --slurp[\s\S]*actions\/runs\/\$run_id\/artifacts\?per_page=100/);
});

test('destructive cleanup requires canonical founder readiness and reviewed targets', () => {
  assert.match(command, /FOUNDER_READY.*true/s);
  assert.match(command, /EXECUTION_ELIGIBLE.*true/s);
  assert.match(command, /TARGET_COUNT.*\^\[1-9\]\[0-9\]\*\$/s);
  assert.match(command, /EXPECTED_TARGET_COUNT:\s*\$\{\{ steps\.review\.outputs\.target_count \}\}/);
  assert.match(command, /DELETE_ALL_OTHER_PRIVILEGED_ACCOUNTS_BIN_GROUP/);
  assert.match(command, /canonical_founder_email:"ceo@bin-groups\.com"/);
  assert.match(command, /execute_cleanup:true/);
  assert.equal((command.match(/privileged-account-cleanup-production\.yml\/dispatches/g) || []).length, 1);
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
    assert.match(workflow, /actions\/checkout@v4/);
    assert.match(workflow, /actions\/setup-node@v4/);
    assert.match(workflow, /google-github-actions\/auth@v3/);
    assert.match(workflow, /actions\/upload-artifact@v4/);
  }
});

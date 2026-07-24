import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/privileged-account-cleanup-dispatch.yml', import.meta.url),
  'utf8',
);

test('cleanup dispatcher is owner-only, draft-only, same-repository, and credential-free', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /github\.event\.pull_request\.draft == true/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /ops\/dispatch-privileged-cleanup-workflow-/);
  assert.match(workflow, /Dispatch protected privileged account cleanup workflow/);
  assert.match(workflow, /actions: write/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.doesNotMatch(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test('cleanup request is one file and binds an exact successful schema-v2 review', () => {
  assert.match(workflow, /Request must change only \.github\/privileged-account-cleanup-dispatch-request/);
  assert.match(workflow, /review_workflow_run_id=/);
  assert.match(workflow, /expected_target_count=/);
  assert.match(workflow, /mutation_allowed.*true/s);
  assert.match(workflow, /hard_launch_claim.*false/s);
  assert.match(workflow, /\.schemaVersion == 2/);
  assert.match(workflow, /\.workflowRunId == \$workflow_run_id/);
  assert.match(workflow, /\.commitSha == \$sha/);
  assert.match(workflow, /\.canonicalFounderReady == true/);
  assert.match(workflow, /\.founderEmailVerified == true/);
  assert.match(workflow, /\.founderPhoneMfaReady == true/);
  assert.match(workflow, /\.executionEligible == true/);
  assert.match(workflow, /\.deletionTargetCount == \$expected/);
  assert.match(workflow, /\.mutationPerformed == false/);
  assert.match(workflow, /\.nonPrivilegedAccountsUntouched == true/);
});

test('cleanup dispatcher launches one exact-main protected destructive workflow and correlates it', () => {
  assert.match(workflow, /privileged-account-cleanup-production\.yml\/dispatches/);
  assert.equal((workflow.match(/privileged-account-cleanup-production\.yml\/dispatches/g) || []).length, 1);
  assert.match(workflow, /expected_commit_sha:\$sha/);
  assert.match(workflow, /canonical_founder_email:"ceo@bin-groups\.com"/);
  assert.match(workflow, /execute_cleanup:true/);
  assert.match(workflow, /DELETE_ALL_OTHER_PRIVILEGED_ACCOUNTS_BIN_GROUP/);
  assert.match(workflow, /privileged-cleanup-run-baseline\.txt/);
  assert.match(workflow, /select\(\.head_sha == \$sha\)/);
  assert.match(workflow, /latest_main/);
});

test('cleanup dispatcher publishes sanitized correlation evidence only', () => {
  assert.match(workflow, /privileged-cleanup-dispatch-evidence\.json/);
  assert.match(workflow, /reviewWorkflowRunId:\$reviewWorkflowRunId/);
  assert.match(workflow, /cleanupWorkflowRunId:\$cleanupWorkflowRunId/);
  assert.match(workflow, /expectedTargetCount:\$expectedTargetCount/);
  assert.match(workflow, /mutationRequested:true/);
  assert.match(workflow, /hardLaunchClaim:false/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /privileged-cleanup-dispatch-evidence[\s\S]*password/i);
  assert.doesNotMatch(workflow, /privileged-cleanup-dispatch-evidence[\s\S]*privateKey/i);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/bank-pilot-dispatch.yml', import.meta.url),
  'utf8',
);

test('bank-pilot dispatcher is owner-only, draft-only, exact-title, and credential-free', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /github\.event\.pull_request\.draft == true/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /ops\/dispatch-bank-pilot-workflow-/);
  assert.match(workflow, /Dispatch protected bank pilot workflow/);
  assert.match(workflow, /actions: write/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.doesNotMatch(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test('bank-pilot marker is one file and keeps public launch disabled', () => {
  assert.match(workflow, /Request must change only \.github\/bank-pilot-dispatch-request/);
  assert.match(workflow, /request.*dispatch-protected-bank-pilot/s);
  assert.match(workflow, /review_workflow_run_id=/);
  assert.match(workflow, /incident_evidence_refs=/);
  assert.match(workflow, /public_release_gate.*false/s);
  assert.match(workflow, /hard_launch_claim.*false/s);
});

test('bank-pilot requires a clean exact-SHA privileged review', () => {
  assert.match(workflow, /\.schemaVersion == 2/);
  assert.match(workflow, /\.commitSha == \$sha/);
  assert.match(workflow, /\.workflowRunId == \$workflow_run_id/);
  assert.match(workflow, /\.canonicalFounderReady == true/);
  assert.match(workflow, /\.founderEmailVerified == true/);
  assert.match(workflow, /\.founderPhoneMfaReady == true/);
  assert.match(workflow, /\.privilegedAccountCountBefore == 1/);
  assert.match(workflow, /\.deletionTargetCount == 0/);
  assert.match(workflow, /\.mutationPerformed == false/);
  assert.match(workflow, /\.nonPrivilegedAccountsUntouched == true/);
});

test('bank-pilot validates Private-HR and dispatches only bank-pilot mode', () => {
  assert.match(workflow, /private-hr-migration-dispatch-current-main\.yml\/dispatches/);
  assert.equal((workflow.match(/private-hr-migration-dispatch-current-main\.yml\/dispatches/g) || []).length, 1);
  assert.match(workflow, /\.schemaVersion == 2/);
  assert.match(workflow, /\.mode == "DRY_RUN"/);
  assert.match(workflow, /\.failureCount == 0/);
  assert.match(workflow, /\.executionRequired == false/);
  assert.match(workflow, /SKIP_EXECUTE_PROCEED_TO_BANK_PILOT/);
  assert.match(workflow, /firebase-production-dispatch-current-main\.yml\/dispatches/);
  assert.equal((workflow.match(/firebase-production-dispatch-current-main\.yml\/dispatches/g) || []).length, 1);
  assert.match(workflow, /launch_mode:"bank-pilot"/);
  assert.match(workflow, /run_public_release_gate:"false"/);
  assert.match(workflow, /incident_active_json:"\[\]"/);
  assert.match(workflow, /hard_clearance_run_id:""/);
  assert.match(workflow, /stripe_live_checkout_session_id:""/);
  assert.match(workflow, /stripe_live_webhook_event_id:""/);
});

test('bank-pilot correlates exact wrapper and production runs and publishes sanitized evidence', () => {
  assert.match(workflow, /owner_snapshot_workflow_run_ids[\s\S]*firebase-production-dispatch-current-main\.yml/);
  assert.match(workflow, /owner_snapshot_workflow_run_ids[\s\S]*firebase-production-deploy\.yml/);
  assert.match(workflow, /owner_locate_new_exact_sha_workflow_run[\s\S]*firebase-production-dispatch-current-main\.yml/);
  assert.match(workflow, /owner_locate_new_exact_sha_workflow_run[\s\S]*firebase-production-deploy\.yml/);
  assert.match(workflow, /bank-pilot-dispatch-evidence\.json/);
  assert.match(workflow, /launchMode:"bank-pilot"/);
  assert.match(workflow, /publicReleaseGate:false/);
  assert.match(workflow, /hardLaunchClaim:false/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /bank-pilot-dispatch-evidence[\s\S]*password/i);
  assert.doesNotMatch(workflow, /bank-pilot-dispatch-evidence[\s\S]*privateKey/i);
});

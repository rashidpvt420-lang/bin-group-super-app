import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [commandWorkflow, diagnosticsWorkflow, productionDispatcher] = await Promise.all([
  readFile(new URL('../../.github/workflows/owner-launch-command.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/firebase-production-failure-diagnostics.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/firebase-production-dispatch-current-main.yml', import.meta.url), 'utf8'),
]);

test('owner launch command is issue-bound, owner-only and exact-command only', () => {
  assert.match(commandWorkflow, /issue_comment:\s*\n\s*types:\s*\[created\]/);
  assert.match(commandWorkflow, /github\.event\.issue\.number == 434/);
  assert.match(commandWorkflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(commandWorkflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(commandWorkflow, /github\.event\.comment\.body == '\/bin-launch prepare-bank-pilot'/);
  assert.match(commandWorkflow, /github\.event\.comment\.body == '\/bin-launch bank-pilot-after-mfa'/);
  assert.match(commandWorkflow, /'\/bin-launch prepare-bank-pilot'/);
  assert.match(commandWorkflow, /'\/bin-launch bank-pilot-after-mfa'/);
  assert.doesNotMatch(commandWorkflow, /github\.event\.comment\.body == '\/bin-launch diagnose-latest-deploy'/);
  assert.doesNotMatch(commandWorkflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(commandWorkflow, /continue-on-error:\s*true/);
});

test('owner launch command ignores non-launch issue comments before any privileged dispatch', () => {
  const jobIf = commandWorkflow.match(/if: >-\n(?<condition>(?:\s+.*\n)+?)\s+runs-on:/)?.groups?.condition || '';
  assert.match(jobIf, /github\.event\.comment\.body == '\/bin-launch prepare-bank-pilot'/);
  assert.match(jobIf, /github\.event\.comment\.body == '\/bin-launch bank-pilot-after-mfa'/);
  assert.doesNotMatch(jobIf, /diagnose-latest-deploy/);
});

test('owner launch command uses both current-main START HERE wrappers', () => {
  assert.match(commandWorkflow, /repos\/\$REPOSITORY\/commits\/main/);
  assert.match(commandWorkflow, /\[\[ "\$first_sha" == "\$second_sha" \]\]/);
  assert.match(commandWorkflow, /private-hr-migration-dispatch-current-main\.yml\/dispatches/);
  assert.match(commandWorkflow, /firebase-production-dispatch-current-main\.yml\/dispatches/);
  assert.doesNotMatch(commandWorkflow, /private-hr-migration\.yml\/dispatches/);
  assert.doesNotMatch(commandWorkflow, /firebase-production-deploy\.yml\/dispatches/);
});

test('private HR report is inspected before bank-pilot is dispatched', () => {
  assert.match(commandWorkflow, /private-hr-migration-dry-run-\$RELEASE_SHA/);
  assert.match(commandWorkflow, /actions\/artifacts\/\$artifact_id\/zip/);
  assert.match(commandWorkflow, /\.schemaVersion == 2/);
  assert.match(commandWorkflow, /\.commitSha == \$sha/);
  assert.match(commandWorkflow, /\.failureCount == 0/);
  assert.match(commandWorkflow, /execution_required.*false/s);
  assert.match(commandWorkflow, /SKIP_EXECUTE_PROCEED_TO_BANK_PILOT/);
  assert.match(commandWorkflow, /latest_main.*RELEASE_SHA/s);
});

test('bank-pilot wrapper is bound to the exact SHA verified by private HR', () => {
  assert.match(commandWorkflow, /--arg expectedSha "\$RELEASE_SHA"/);
  assert.match(commandWorkflow, /expected_commit_sha:\$expectedSha/);
  assert.match(productionDispatcher, /^\s+expected_commit_sha:/m);
  assert.match(productionDispatcher, /EXPECTED_COMMIT_SHA:\s*\$\{\{ inputs\.expected_commit_sha \}\}/);
  assert.match(productionDispatcher, /main_before.*!=.*EXPECTED_COMMIT_SHA/s);
  assert.match(productionDispatcher, /main_sha.*!=.*EXPECTED_COMMIT_SHA/s);
  assert.match(productionDispatcher, /no longer matches verified expected SHA/);
  assert.match(productionDispatcher, /does not match verified expected SHA/);
});

test('owner launch command cannot request public launch or hard clearance', () => {
  assert.match(commandWorkflow, /launch_mode:"bank-pilot"/);
  assert.match(commandWorkflow, /run_public_release_gate:"false"/);
  assert.match(commandWorkflow, /hard_clearance_run_id:""/);
  assert.match(commandWorkflow, /stripe_live_checkout_session_id:""/);
  assert.match(commandWorkflow, /stripe_live_webhook_event_id:""/);
  assert.doesNotMatch(commandWorkflow, /launch_mode:"public"/);
  assert.doesNotMatch(commandWorkflow, /live-role-smoke\.yml\/dispatches/);
});

test('production failure diagnostics are failure-only and preserve fail-closed authority', () => {
  assert.match(diagnosticsWorkflow, /workflows:\s*\n\s*- Firebase Production Deploy/);
  assert.match(diagnosticsWorkflow, /if: github\.event\.workflow_run\.conclusion == 'failure'/);
  assert.match(diagnosticsWorkflow, /Validate protected source run through GitHub API/);
  assert.match(diagnosticsWorkflow, /\.event == "workflow_dispatch"/);
  assert.match(diagnosticsWorkflow, /\.head_branch == "main"/);
  assert.match(diagnosticsWorkflow, /\.head_sha == \$sha/);
  assert.match(diagnosticsWorkflow, /\.repository\.full_name == \$repository/);
  assert.match(diagnosticsWorkflow, /\.conclusion == "failure"/);
  assert.match(diagnosticsWorkflow, /actions:\s*read/);
  assert.match(diagnosticsWorkflow, /issues:\s*write/);
  assert.match(diagnosticsWorkflow, /githubSecretMaskingApplied:\s*true/);
  assert.match(diagnosticsWorkflow, /secretValuesIntentionallyCollected:\s*false/);
  assert.match(diagnosticsWorkflow, /hardLaunchClaim:\s*false/);
  assert.match(diagnosticsWorkflow, /actions\/upload-artifact@v7/);
  assert.match(diagnosticsWorkflow, /firebase-production-failure\.log/);
  assert.match(diagnosticsWorkflow, /issues\/\$ISSUE_NUMBER\/comments/);
  assert.doesNotMatch(diagnosticsWorkflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(diagnosticsWorkflow, /actions:\s*write/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [commandWorkflow, diagnosticsWorkflow, productionDispatcher, diagnosisScript] = await Promise.all([
  readFile(new URL('../../.github/workflows/owner-launch-command.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/firebase-production-failure-diagnostics.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/firebase-production-dispatch-current-main.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/run-owner-production-diagnosis.sh', import.meta.url), 'utf8'),
]);

test('owner launch command is issue-bound, owner-only and exact-command only', () => {
  assert.match(commandWorkflow, /issue_comment:\s*\n\s*types:\s*\[created\]/);
  assert.match(commandWorkflow, /github\.event\.issue\.number == 434/);
  assert.match(commandWorkflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(commandWorkflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(commandWorkflow, /github\.event\.comment\.body == '\/bin-launch prepare-bank-pilot'/);
  assert.match(commandWorkflow, /github\.event\.comment\.body == '\/bin-launch bank-pilot-after-mfa'/);
  assert.match(commandWorkflow, /github\.event\.comment\.body == '\/bin-launch diagnose-latest-deploy'/);
  assert.doesNotMatch(commandWorkflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(commandWorkflow, /continue-on-error:\s*true/);
});

test('owner diagnosis command runs directly without secondary workflow dispatch', () => {
  assert.match(commandWorkflow, /dispatch-production-diagnosis:/);
  assert.match(commandWorkflow, /Run exact-main sanitized diagnosis/);
  assert.match(commandWorkflow, /bash scripts\/run-owner-production-diagnosis\.sh/);
  assert.match(commandWorkflow, /actions\/upload-artifact@v7/);
  assert.match(commandWorkflow, /steps\.diagnosis\.outputs\.artifact_name/);
  assert.match(commandWorkflow, /Production mutation: none/);
  assert.match(commandWorkflow, /Raw job log uploaded: false/);
  assert.doesNotMatch(commandWorkflow, /owner-production-diagnosis\.yml\/dispatches/);
  assert.doesNotMatch(commandWorkflow, /owner_snapshot_workflow_run_ids[\s\S]*owner-production-diagnosis\.yml/);
});

test('direct diagnosis script is exact-main, paginated, sanitized and aggregate-only', () => {
  assert.match(diagnosisScript, /current_main=.*git\/ref\/heads\/main/s);
  assert.match(diagnosisScript, /current_main.*RELEASE_SHA/s);
  assert.match(diagnosisScript, /git rev-parse HEAD/);
  assert.match(diagnosisScript, /gh api --paginate --slurp/);
  assert.match(diagnosisScript, /select-production-diagnosis-run\.mjs/);
  assert.match(diagnosisScript, /sanitize-production-diagnostic-log\.mjs/);
  assert.match(diagnosisScript, /fullArtifactLogRedacted:\s*true/);
  assert.match(diagnosisScript, /rawJobLogUploaded:\s*false/);
  assert.match(diagnosisScript, /personalIdentifiersRedacted:\s*true/);
  assert.match(diagnosisScript, /hardLaunchClaim:\s*false/);
  assert.match(diagnosisScript, /Latest Firebase production failure diagnosis/);
  assert.doesNotMatch(diagnosisScript, /firebase deploy/);
  assert.doesNotMatch(diagnosisScript, /workflow_dispatch/);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [commandWorkflow, diagnosticsWorkflow, diagnosisScript] = await Promise.all([
  readFile(new URL('../../.github/workflows/owner-launch-command.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/firebase-production-failure-diagnostics.yml', import.meta.url), 'utf8'),
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
  assert.match(commandWorkflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02\s+# v4/);
  assert.match(commandWorkflow, /steps\.diagnosis\.outputs\.artifact_name/);
  assert.match(commandWorkflow, /Production mutation: none/);
  assert.match(commandWorkflow, /Raw job log uploaded: false/);
  assert.doesNotMatch(commandWorkflow, /owner-production-diagnosis\.yml\/dispatches/);
});

test('direct diagnosis script is exact-main, paginated, sanitized and aggregate-only', () => {
  assert.match(diagnosisScript, /current_main=.*git\/ref\/heads\/main/s);
  assert.match(diagnosisScript, /current_main.*RELEASE_SHA/s);
  assert.match(diagnosisScript, /git rev-parse HEAD/);
  assert.match(diagnosisScript, /gh api --paginate --slurp/);
  assert.match(diagnosisScript, /event=workflow_dispatch/);
  assert.match(diagnosisScript, /select-production-diagnosis-run\.mjs/);
  assert.match(diagnosisScript, /sanitize-production-diagnostic-log\.mjs/);
  assert.match(diagnosisScript, /fullArtifactLogRedacted:\s*true/);
  assert.match(diagnosisScript, /rawJobLogUploaded:\s*false/);
  assert.match(diagnosisScript, /personalIdentifiersRedacted:\s*true/);
  assert.match(diagnosisScript, /hardLaunchClaim:\s*false/);
  assert.match(diagnosisScript, /Latest Firebase production failure diagnosis/);
  assert.doesNotMatch(diagnosisScript, /firebase deploy/);
  assert.doesNotMatch(diagnosisScript, /\/dispatches/);
});

test('direct diagnosis extracts deploy process output after GitHub environment metadata', () => {
  assert.match(diagnosisScript, /##\\\[group\\\]Run node scripts\\\/deploy-firebase-production\\\.mjs/);
  assert.match(diagnosisScript, /##\\\[endgroup\\\]/);
  assert.match(diagnosisScript, /Post job cleanup\\\.|##\\\[group\\\]Post/);
  assert.match(diagnosisScript, /deployStepOutputLines:\s*deployStepOutput/);
  assert.match(diagnosisScript, /schemaVersion:\s*6/);
  assert.match(diagnosisScript, /### Deploy-step output/);
  assert.match(diagnosisScript, /deployStepOutputLines\[-60:\]/);
  assert.match(diagnosisScript, /normalizedErrorLines\[-20:\]/);
});

test('owner launch command generates one exact-main protected privileged review', () => {
  assert.match(commandWorkflow, /prepare-protected-bank-pilot:/);
  assert.match(commandWorkflow, /repos\/\$REPOSITORY\/commits\/main/);
  assert.match(commandWorkflow, /\[\[ "\$first_sha" == "\$second_sha" \]\]/);
  assert.match(commandWorkflow, /Checkout exact current main/);
  assert.match(commandWorkflow, /Use Node\.js 22/);
  assert.match(commandWorkflow, /owner_snapshot_workflow_run_ids/);
  assert.match(commandWorkflow, /owner_locate_new_exact_sha_workflow_run/);
  assert.match(commandWorkflow, /privileged-review-baseline-run-ids\.json/);
  assert.equal(
    (commandWorkflow.match(/privileged-account-cleanup-dry-run\.yml\/dispatches/g) || []).length,
    1,
    'privileged review must be dispatched exactly once per owner-command run',
  );
  assert.match(commandWorkflow, /expected_commit_sha:\$sha/);
  assert.match(commandWorkflow, /REVIEW_PRIVILEGED_ACCOUNT_CLEANUP_BIN_GROUP/);
  assert.match(commandWorkflow, /No duplicate dispatch was attempted/);
});

test('privileged review artifact is inspected before protected PR handoff', () => {
  assert.match(commandWorkflow, /privileged-account-cleanup-review-\$RELEASE_SHA/);
  assert.match(commandWorkflow, /actions\/artifacts\/\$artifact_id\/zip/);
  assert.match(commandWorkflow, /\.schemaVersion == 2/);
  assert.match(commandWorkflow, /\.commitSha == \$sha/);
  assert.match(commandWorkflow, /\.workflowRunId == \$workflow_run_id/);
  assert.match(commandWorkflow, /\.canonicalFounderCount == 1/);
  assert.match(commandWorkflow, /\.canonicalFounderReady == true/);
  assert.match(commandWorkflow, /\.founderPhoneMfaReady == true/);
  assert.match(commandWorkflow, /\.deletionTargetCount == 0/);
  assert.match(commandWorkflow, /\.mutationPerformed == false/);
  assert.match(commandWorkflow, /latest_main.*RELEASE_SHA/s);
});

test('owner command hands off to the draft PR dispatcher instead of dispatching production', () => {
  assert.match(commandWorkflow, /one open draft Owner-request PR/);
  assert.match(commandWorkflow, /\.github\/bank-pilot-dispatch-request/);
  assert.match(commandWorkflow, /PR dispatcher will run Private-HR and the controlled bank-pilot/);
  assert.doesNotMatch(commandWorkflow, /private-hr-migration-dispatch-current-main\.yml\/dispatches/);
  assert.doesNotMatch(commandWorkflow, /firebase-production-dispatch-current-main\.yml\/dispatches/);
  assert.doesNotMatch(commandWorkflow, /firebase-production-deploy\.yml\/dispatches/);
  assert.doesNotMatch(commandWorkflow, /FOUNDER_EMAIL:\s*ceo@bin-groups\.com/);
});

test('owner preparation cannot request public launch or claim hard clearance', () => {
  assert.match(commandWorkflow, /Production deployment: not dispatched by this command/);
  assert.match(commandWorkflow, /Public-release gate: disabled/);
  assert.match(commandWorkflow, /Hard-launch claim: false/);
  assert.doesNotMatch(commandWorkflow, /launch_mode:"public"/);
  assert.doesNotMatch(commandWorkflow, /live-role-smoke\.yml\/dispatches/);
});

test('production failure diagnostics remain failed-run-only and preserve fail-closed authority', () => {
  assert.match(diagnosticsWorkflow, /workflows:\s*\n\s*- Firebase Production Deploy/);
  assert.match(diagnosticsWorkflow, /if: github\.event_name == 'pull_request' \|\| github\.event\.workflow_run\.conclusion == 'failure'/);
  assert.match(diagnosticsWorkflow, /Diagnose failed Firebase production deployment/);
  assert.match(diagnosticsWorkflow, /requester.*GITHUB_REPOSITORY_OWNER/);
  assert.match(diagnosticsWorkflow, /hard_launch_claim/);
  assert.match(diagnosticsWorkflow, /Validate protected source run through GitHub API/);
  assert.match(diagnosticsWorkflow, /\.event == "workflow_dispatch"/);
  assert.match(diagnosticsWorkflow, /\.head_branch == "main"/);
  assert.match(diagnosticsWorkflow, /\.head_sha == \$sha/);
  assert.match(diagnosticsWorkflow, /\.conclusion == "failure"/);
  assert.match(diagnosticsWorkflow, /actions:\s*read/);
  assert.match(diagnosticsWorkflow, /issues:\s*write/);
  assert.match(diagnosticsWorkflow, /githubSecretMaskingApplied:\s*true/);
  assert.match(diagnosticsWorkflow, /secretValuesIntentionallyCollected:\s*false/);
  assert.match(diagnosticsWorkflow, /hardLaunchClaim:\s*false/);
  assert.doesNotMatch(diagnosticsWorkflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(diagnosticsWorkflow, /actions:\s*write/);
});

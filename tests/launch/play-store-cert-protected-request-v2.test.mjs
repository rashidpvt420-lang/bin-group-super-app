import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/pr-validation.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('normal owner PR event is only a dispatcher and child workflow_dispatch is the secret boundary', () => {
  assert.match(workflow, /dispatch_play_certificate:/);
  assert.match(workflow, /github\.event_name == 'pull_request'/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /actions\/workflows\/pr-validation\.yml\/dispatches/);
  assert.match(workflow, /announce_play_certificate:/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /inputs\.operation == 'export-play-certificate'/);
});

test('request authorization is owner-only, same-repository, exact-title, branch-prefix, and marker-only', () => {
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /ops\/dispatch-play-cert-extraction-/);
  assert.match(workflow, /Dispatch protected Play certificate extraction/);
  assert.match(workflow, /Certificate request must change only \.github\/play-cert-extraction-request/);
  assert.match(workflow, /private_material_artifact_allowed=false/);
  assert.match(workflow, /hard_launch_claim=false/);
});

test('child authorization binds to main and the original draft request', () => {
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == 'refs\/heads\/main' \]\]/);
  assert.match(workflow, /EXPECTED_COMMIT_SHA/);
  assert.match(workflow, /current_main/);
  assert.match(workflow, /pr_state/);
  assert.match(workflow, /pr_draft/);
  assert.match(workflow, /pr_owner/);
  assert.match(workflow, /pr_title/);
  assert.match(workflow, /pr_head/);
  assert.match(workflow, /\[\[ "\$pr_draft" == 'true' \]\]/);
});

test('protected signing inputs are fail-closed and sanitized', () => {
  for (const secret of [
    'ANDROID_UPLOAD_KEYSTORE_BASE64',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`));
  }
  assert.match(workflow, /Inspect protected Android signing inputs/);
  assert.match(workflow, /Missing protected Android signing inputs/);
  assert.match(workflow, /missing_inputs:/);
  assert.doesNotMatch(workflow, /echo "\$ANDROID_UPLOAD_KEYSTORE_BASE64"/);
});

test('workflow publishes run status, public artifact, and sanitized failure details', () => {
  assert.match(workflow, /WAITING_FOR_PRODUCTION_ENVIRONMENT/);
  assert.match(workflow, /Workflow run ID:/);
  assert.match(workflow, /Upload public Play certificate artifact/);
  assert.match(workflow, /report_play_certificate:/);
  assert.match(workflow, /Protected signing inputs ready:/);
  assert.match(workflow, /Missing protected inputs:/);
  assert.match(workflow, /Status: \\`SUCCESS\\`/);
  assert.match(workflow, /issues\/\$TRACKING_ISSUE/);
  assert.match(workflow, /pulls\/\$REQUEST_PR/);
  assert.doesNotMatch(workflow, /merge_pull_request/);
});

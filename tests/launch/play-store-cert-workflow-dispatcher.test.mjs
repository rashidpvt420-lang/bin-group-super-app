import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Contract v2: PR Validation dispatches its own production-protected certificate job.
const workflowPath = new URL('../../.github/workflows/pr-validation.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('v2 active PR Validation dispatches certificate export only from an exact draft owner request', () => {
  assert.match(workflow, /dispatch-play-certificate-workflow:/);
  assert.match(workflow, /github\.event_name == 'pull_request'/);
  assert.match(workflow, /github\.event\.pull_request\.draft == true/);
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /ops\/dispatch-play-cert-workflow-/);
  assert.match(workflow, /Dispatch protected Play certificate workflow/);
});

test('v2 dispatcher requires one canonical marker and minimum write permission', () => {
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pull-requests: read/);
  assert.match(workflow, /Request must change only \.github\/play-cert-workflow-dispatch-request/);
  assert.match(workflow, /dispatch-protected-play-certificate-workflow/);
  assert.match(workflow, /private_material_artifact_allowed=false/);
  assert.match(workflow, /hard_launch_claim=false/);
});

test('v2 registered workflow exposes boolean certificate input and direct exact-main dispatch', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /export_play_certificate:/);
  assert.match(workflow, /type: boolean/);
  assert.match(workflow, /inputs\.export_play_certificate == true/);
  assert.match(workflow, /actions\/workflows\/pr-validation\.yml\/dispatches/);
  assert.match(workflow, /inputs\[export_play_certificate\]=true/);
  assert.match(workflow, /-f ref='main'/);
  assert.match(workflow, /event=workflow_dispatch/);
  assert.match(workflow, /head_sha == \$sha/);
  assert.doesNotMatch(workflow, /actions\/workflows\/extract-play-store-cert\.yml\/dispatches/);
});

test('v2 dispatcher never accesses Android signing secrets or private signing material', () => {
  const dispatcher = workflow.match(/dispatch-play-certificate-workflow:[\s\S]*?\n  export-play-upload-certificate:/)?.[0] ?? '';
  assert.ok(dispatcher.length > 0);
  assert.doesNotMatch(dispatcher, /ANDROID_UPLOAD_KEYSTORE_BASE64/);
  assert.doesNotMatch(dispatcher, /ANDROID_KEYSTORE_PASSWORD/);
  assert.doesNotMatch(dispatcher, /ANDROID_KEY_ALIAS/);
  assert.doesNotMatch(dispatcher, /ANDROID_KEY_PASSWORD/);
  assert.doesNotMatch(dispatcher, /bin-group-upload\.jks/);
  assert.doesNotMatch(dispatcher, /keystore\.properties/);
  assert.doesNotMatch(dispatcher, /keytool/);
});

test('v2 certificate export remains production-protected and exact-main bound', () => {
  assert.match(workflow, /export-play-upload-certificate:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /Resolve stable exact current main/);
  assert.match(workflow, /Checkout exact current main/);
  assert.match(workflow, /ref: \$\{\{ steps\.release\.outputs\.sha \}\}/);
  assert.match(workflow, /Verify main remained frozen before extraction/);
  assert.match(workflow, /Verify main remained frozen through extraction/);
});
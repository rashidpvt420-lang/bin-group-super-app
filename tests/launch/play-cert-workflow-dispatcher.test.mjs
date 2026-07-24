import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/pr-validation.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('active PR Validation dispatches the registered certificate workflow only from an exact draft owner request', () => {
  assert.match(workflow, /dispatch-play-certificate-workflow:/);
  assert.match(workflow, /github\.event_name == 'pull_request'/);
  assert.match(workflow, /github\.event\.pull_request\.draft == true/);
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /ops\/dispatch-play-cert-workflow-/);
  assert.match(workflow, /Dispatch protected Play certificate workflow/);
});

test('dispatcher requires one canonical marker and has only the minimum write permission', () => {
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pull-requests: read/);
  assert.match(workflow, /Request must change only \.github\/play-cert-workflow-dispatch-request/);
  assert.match(workflow, /dispatch-protected-play-certificate-workflow/);
  assert.match(workflow, /private_material_artifact_allowed=false/);
  assert.match(workflow, /hard_launch_claim=false/);
});

test('dispatcher resolves stable current main and invokes workflow_dispatch on the registered workflow', () => {
  assert.match(workflow, /Resolve stable current main and snapshot workflow runs/);
  assert.match(workflow, /first_sha=.*commits\/main/);
  assert.match(workflow, /second_sha=.*commits\/main/);
  assert.match(workflow, /actions\/workflows\/extract-play-store-cert\.yml\/dispatches/);
  assert.match(workflow, /-f ref='main'/);
  assert.match(workflow, /event=workflow_dispatch/);
  assert.match(workflow, /head_sha == \$sha/);
});

test('dispatcher never accesses Android signing secrets or private material', () => {
  const dispatcher = workflow.match(/dispatch-play-certificate-workflow:[\s\S]*?\n  export-play-upload-certificate:/)?.[0] ?? '';
  assert.ok(dispatcher.length > 0);
  assert.doesNotMatch(dispatcher, /ANDROID_UPLOAD_KEYSTORE_BASE64/);
  assert.doesNotMatch(dispatcher, /ANDROID_KEYSTORE_PASSWORD/);
  assert.doesNotMatch(dispatcher, /ANDROID_KEY_ALIAS/);
  assert.doesNotMatch(dispatcher, /ANDROID_KEY_PASSWORD/);
  assert.doesNotMatch(dispatcher, /base64 --decode/);
  assert.doesNotMatch(dispatcher, /keytool/);
});

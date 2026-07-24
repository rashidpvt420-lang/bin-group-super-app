import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/pr-validation.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('normal PR event dispatches a workflow-dispatch child without signing secrets', () => {
  assert.match(workflow, /dispatch_play_certificate:/);
  assert.match(workflow, /github\.event_name == 'pull_request'/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /inputs\[operation\]=export-play-certificate/);
  assert.match(workflow, /inputs\[confirmation\]=EXPORT_PUBLIC_PLAY_CERTIFICATE_BIN_GROUP/);
  assert.match(workflow, /announce_play_certificate:/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
});

test('child authorization requires exact main and an open draft owner request', () => {
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == 'refs\/heads\/main' \]\]/);
  assert.match(workflow, /EXPECTED_COMMIT_SHA/);
  assert.match(workflow, /current_main/);
  assert.match(workflow, /\[\[ "\$pr_state" == 'open' \]\]/);
  assert.match(workflow, /\[\[ "\$pr_draft" == 'true' \]\]/);
  assert.match(workflow, /\[\[ "\$pr_owner" == "\$GITHUB_REPOSITORY_OWNER" \]\]/);
  assert.match(workflow, /Dispatch protected Play certificate extraction/);
  assert.match(workflow, /\.github\/play-cert-extraction-request/);
});

test('protected inputs are fail-closed and never printed', () => {
  for (const secret of [
    'ANDROID_UPLOAD_KEYSTORE_BASE64',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`));
  }
  assert.match(workflow, /Missing protected Android signing inputs/);
  assert.doesNotMatch(workflow, /echo "\$ANDROID_UPLOAD_KEYSTORE_BASE64"/);
});

test('exact-main public artifact lifecycle is enforced', () => {
  assert.match(workflow, /Checkout exact current main/);
  assert.match(workflow, /ref: \$\{\{ env\.RELEASE_SHA \}\}/);
  assert.match(workflow, /Verify main remained frozen before extraction/);
  assert.match(workflow, /Verify main remained frozen through extraction/);
  assert.match(workflow, /Upload public Play certificate artifact/);
  assert.match(workflow, /Remove private Android signing material/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/pr-validation.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('active PR Validation separates ordinary validation, request dispatch, and protected child export', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /dispatch_play_certificate:/);
  assert.match(workflow, /announce_play_certificate:/);
  assert.match(workflow, /export_play_certificate:/);
  assert.match(workflow, /report_play_certificate:/);
  assert.match(workflow, /inputs\.operation == 'export-play-certificate'/);
  assert.match(workflow, /environment: production/);
});

test('owner request dispatcher is same-repository, exact-title, marker-only, and secret-free', () => {
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /startsWith\(github\.event\.pull_request\.head\.ref, 'ops\/dispatch-play-cert-extraction-'\)/);
  assert.match(workflow, /github\.event\.pull_request\.title == 'Dispatch protected Play certificate extraction'/);
  assert.match(workflow, /Certificate request must change only \.github\/play-cert-extraction-request/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /actions\/workflows\/pr-validation\.yml\/dispatches/);
});

test('protected child executes stable current main and not PR-head code', () => {
  assert.match(workflow, /expected_commit_sha:/);
  assert.match(workflow, /EXPECTED_COMMIT_SHA/);
  assert.match(workflow, /current_main/);
  assert.match(workflow, /ref: \$\{\{ env\.RELEASE_SHA \}\}/);
  assert.match(workflow, /Verify main remained frozen before extraction/);
  assert.match(workflow, /Verify main remained frozen through extraction/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.head_ref \}\}/);
});

test('active certificate job uses protected signing inputs and exports only public evidence', () => {
  for (const secret of [
    'ANDROID_UPLOAD_KEYSTORE_BASE64',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`));
  }

  assert.match(workflow, /base64 --decode > android\/app\/bin-group-upload\.jks/);
  assert.match(workflow, /keytool -exportcert -rfc/);
  assert.match(workflow, /bin-group-upload-certificate\.pem/);
  assert.match(workflow, /publicCertificateOnly:true/);
  assert.match(workflow, /privateKeyExcluded:true/);
  assert.match(workflow, /keystoreExcluded:true/);
  assert.match(workflow, /passwordsExcluded:true/);
  assert.match(workflow, /Verify certificate artifact allowlist/);
  assert.match(workflow, /Upload public Play certificate artifact/);
  assert.match(workflow, /Remove private Android signing material/);
  assert.doesNotMatch(workflow, /path:\s+android\/app\/bin-group-upload\.jks/);
  assert.doesNotMatch(workflow, /path:\s+android\/keystore\.properties/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/privileged-account-review-request.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('Play certificate extraction uses the active production-protected owner request workflow', () => {
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /\.github\/play-cert-extraction-request-v5/);
  assert.match(workflow, /announce_play_certificate:/);
  assert.match(workflow, /export_play_certificate:/);
  assert.match(workflow, /environment: production/);
});

test('certificate request is same-repository owner-only, exact-title, exact-branch and marker-only', () => {
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /ops\/dispatch-play-cert-v5-/);
  assert.match(workflow, /Dispatch protected Play certificate extraction v5/);
  assert.match(workflow, /Certificate request must change only \.github\/play-cert-extraction-request-v5/);
  assert.match(workflow, /extract-public-play-upload-certificate-v5/);
});

test('certificate run announces exact current main before protected secret access', () => {
  assert.match(workflow, /Resolve stable exact current main/);
  assert.match(workflow, /first_sha=.*commits\/main/);
  assert.match(workflow, /second_sha=.*commits\/main/);
  assert.match(workflow, /WAITING_FOR_PRODUCTION_ENVIRONMENT/);
  assert.match(workflow, /Workflow run ID:/);
  assert.match(workflow, /needs: announce_play_certificate/);
  assert.match(workflow, /ref: \$\{\{ env\.RELEASE_SHA \}\}/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
});

test('certificate extraction uses all protected Android signing secrets and fails closed', () => {
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
  assert.match(workflow, /Fail closed when protected signing inputs are missing/);
  assert.match(workflow, /base64 --decode > android\/app\/bin-group-upload\.jks/);
  assert.match(workflow, /keytool -exportcert -rfc/);
});

test('certificate artifact is public-only and private material is removed', () => {
  assert.match(workflow, /bin-group-upload-certificate\.pem/);
  assert.match(workflow, /publicCertificateOnly: true/);
  assert.match(workflow, /privateKeyExcluded: true/);
  assert.match(workflow, /keystoreExcluded: true/);
  assert.match(workflow, /passwordsExcluded: true/);
  assert.match(workflow, /Verify certificate artifact allowlist/);
  assert.match(workflow, /Upload public Play certificate artifact/);
  assert.match(workflow, /Remove private Android signing material/);
  assert.match(workflow, /shred -u android\/app\/bin-group-upload\.jks/);
  assert.doesNotMatch(workflow, /path:\s+android\/app\/bin-group-upload\.jks/);
  assert.doesNotMatch(workflow, /path:\s+android\/keystore\.properties/);
});

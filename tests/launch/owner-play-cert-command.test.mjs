import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/extract-play-store-cert.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('certificate workflow accepts only the exact owner issue command', () => {
  assert.match(workflow, /issue_comment:/);
  assert.match(workflow, /github\.event\.issue\.number == 434/);
  assert.match(workflow, /!github\.event\.issue\.pull_request/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /github\.event\.comment\.body == '\/bin-launch extract-play-store-cert'/);
  assert.doesNotMatch(workflow, /author_association/);
});

test('certificate run announces stable exact current main before production access', () => {
  assert.match(workflow, /announce:/);
  assert.match(workflow, /Resolve stable exact current main/);
  assert.match(workflow, /first_sha=.*commits\/main/);
  assert.match(workflow, /second_sha=.*commits\/main/);
  assert.match(workflow, /WAITING_FOR_PRODUCTION_ENVIRONMENT/);
  assert.match(workflow, /Workflow run ID:/);
  assert.match(workflow, /export_certificate:/);
  assert.match(workflow, /needs: announce/);
  assert.match(workflow, /environment: production/);
});

test('protected export uses all Android signing secrets and fails closed', () => {
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

test('certificate export checks out only exact main and freezes it through extraction', () => {
  assert.match(workflow, /Checkout exact current main/);
  assert.match(workflow, /ref: \$\{\{ env\.RELEASE_SHA \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /Verify main remained frozen before extraction/);
  assert.match(workflow, /Verify main remained frozen through extraction/);
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.head\.sha/);
});

test('artifact contains only public certificate evidence and private material is removed', () => {
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

test('workflow publishes sanitized success or failure evidence', () => {
  assert.match(workflow, /Publish certificate extraction outcome/);
  assert.match(workflow, /Status: \\`SUCCESS\\`/);
  assert.match(workflow, /Status: \\`FAILURE\\`/);
  assert.match(workflow, /Protected signing inputs ready:/);
  assert.match(workflow, /Missing protected inputs:/);
  assert.match(workflow, /issues\/\$TRACKING_ISSUE/);
  assert.match(workflow, /issues\/\$COMMAND_ISSUE/);
  assert.doesNotMatch(workflow, /echo "\$ANDROID_UPLOAD_KEYSTORE_BASE64"/);
});
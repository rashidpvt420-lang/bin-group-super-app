import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/extract-play-store-cert.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('Play Store certificate extraction is owner-only and production-protected', () => {
  assert.match(workflow, /github\.event\.issue\.number == 434/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(workflow, /github\.event\.comment\.body == '\/bin-launch extract-play-store-cert'/);
  assert.match(workflow, /environment: production/);
});

test('Play Store certificate extraction uses all protected Android signing secrets', () => {
  for (const secret of [
    'ANDROID_UPLOAD_KEYSTORE_BASE64',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`));
  }

  assert.match(workflow, /base64 --decode > android\/app\/bin-group-upload\.jks/);
  assert.match(workflow, /storeFile=app\/bin-group-upload\.jks/);
  assert.match(workflow, /keytool -exportcert -rfc/);
});

test('certificate artifact excludes private signing material', () => {
  assert.match(workflow, /bin-group-upload-certificate\.pem/);
  assert.match(workflow, /publicCertificateOnly: true/);
  assert.match(workflow, /privateKeyExcluded: true/);
  assert.match(workflow, /keystoreExcluded: true/);
  assert.match(workflow, /passwordsExcluded: true/);
  assert.match(workflow, /Verify artifact allowlist/);
  assert.match(workflow, /Remove private signing material/);
  assert.match(workflow, /shred -u android\/app\/bin-group-upload\.jks/);
  assert.doesNotMatch(workflow, /path:\s+android\/app\/bin-group-upload\.jks/);
  assert.doesNotMatch(workflow, /path:\s+android\/keystore\.properties/);
});

test('certificate evidence binds to stable exact current main', () => {
  assert.match(workflow, /Resolve stable exact current main/);
  assert.match(workflow, /first_sha=.*commits\/main/);
  assert.match(workflow, /second_sha=.*commits\/main/);
  assert.match(workflow, /ref: \$\{\{ steps\.release\.outputs\.sha \}\}/);
  assert.match(workflow, /commitSha: \$commitSha/);
  assert.match(workflow, /packageName: \$packageName/);
  assert.match(workflow, /hardLaunchClaim: false/);
});

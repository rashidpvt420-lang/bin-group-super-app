import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/pr-validation.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('active PR Validation workflow contains the protected Play certificate job', () => {
  assert.match(workflow, /export-play-upload-certificate:/);
  assert.match(workflow, /name: Export protected Play upload certificate/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /github\.event_name == 'pull_request'/);
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /startsWith\(github\.event\.pull_request\.head\.ref, 'ops\/dispatch-play-cert-extraction-'\)/);
  assert.match(workflow, /github\.event\.pull_request\.title == 'Dispatch protected Play certificate extraction'/);
});

test('active certificate job executes stable current main and not PR-head code', () => {
  assert.match(workflow, /Resolve stable exact current main/);
  assert.match(workflow, /first_sha=.*commits\/main/);
  assert.match(workflow, /second_sha=.*commits\/main/);
  assert.match(workflow, /ref: \$\{\{ steps\.release\.outputs\.sha \}\}/);
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
  assert.match(workflow, /publicCertificateOnly: true/);
  assert.match(workflow, /privateKeyExcluded: true/);
  assert.match(workflow, /keystoreExcluded: true/);
  assert.match(workflow, /passwordsExcluded: true/);
  assert.match(workflow, /Verify certificate artifact allowlist/);
  assert.match(workflow, /Upload public Play certificate artifact/);
  assert.match(workflow, /Remove private Android signing material/);
  assert.doesNotMatch(workflow, /path:\s+android\/app\/bin-group-upload\.jks/);
  assert.doesNotMatch(workflow, /path:\s+android\/keystore\.properties/);
});

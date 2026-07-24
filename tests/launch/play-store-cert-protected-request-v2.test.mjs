import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/play-cert-protected-request.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('certificate request separates untrusted PR checks from trusted target execution', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /\.github\/play-cert-extraction-request-v3/);
  assert.match(workflow, /block_request_merge:/);
  assert.match(workflow, /Refuse request PR merge/);
  assert.match(workflow, /exit 1/);
  assert.match(workflow, /github\.event_name == 'pull_request_target'/);
  assert.match(workflow, /environment: production/);
});

test('certificate request is owner-only, same-repository, exact-title, branch-prefix, draft-only, and marker-only', () => {
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /ops\/dispatch-play-cert-v3-/);
  assert.match(workflow, /Dispatch protected Play certificate extraction v3/);
  assert.match(workflow, /REQUEST_DRAFT/);
  assert.match(workflow, /Request must change only \.github\/play-cert-extraction-request-v3/);
  assert.match(workflow, /extract-public-play-upload-certificate-v3/);
});

test('trusted workflow resolves stable current main and never checks out request code', () => {
  assert.match(workflow, /Resolve stable exact current main/);
  assert.match(workflow, /first_sha=.*commits\/main/);
  assert.match(workflow, /second_sha=.*commits\/main/);
  assert.match(workflow, /ref: \$\{\{ env\.RELEASE_SHA \}\}/);
  assert.match(workflow, /Verify main remained frozen before extraction/);
  assert.match(workflow, /Verify main remained frozen through extraction/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.head_ref \}\}/);
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
  assert.match(workflow, /Fail closed when protected signing inputs are missing/);
  assert.match(workflow, /missing_inputs:/);
  assert.doesNotMatch(workflow, /echo "\$ANDROID_UPLOAD_KEYSTORE_BASE64"/);
});

test('artifact contains only public certificate evidence and private material is removed', () => {
  assert.match(workflow, /keytool -exportcert -rfc/);
  assert.match(workflow, /bin-group-upload-certificate\.pem/);
  assert.match(workflow, /publicCertificateOnly:true/);
  assert.match(workflow, /privateKeyExcluded:true/);
  assert.match(workflow, /keystoreExcluded:true/);
  assert.match(workflow, /passwordsExcluded:true/);
  assert.match(workflow, /Verify certificate artifact allowlist/);
  assert.match(workflow, /Remove private Android signing material/);
  assert.match(workflow, /shred -u android\/app\/bin-group-upload\.jks/);
  assert.doesNotMatch(workflow, /path:\s+android\/app\/bin-group-upload\.jks/);
  assert.doesNotMatch(workflow, /path:\s+android\/keystore\.properties/);
});

test('workflow uses expression-safe job IDs and publishes pre-approval and final status', () => {
  assert.match(workflow, /export_certificate:/);
  assert.match(workflow, /needs: \[announce, export_certificate\]/);
  assert.match(workflow, /needs\.export_certificate\.result/);
  assert.doesNotMatch(workflow, /needs\.export-certificate/);
  assert.match(workflow, /WAITING_FOR_PRODUCTION_ENVIRONMENT/);
  assert.match(workflow, /Workflow run ID:/);
  assert.match(workflow, /Publish protected certificate outcome/);
  assert.match(workflow, /Status: \\`SUCCESS\\`/);
  assert.match(workflow, /issues\/\$TRACKING_ISSUE/);
  assert.match(workflow, /pulls\/\$REQUEST_PR/);
  assert.match(workflow, /-f state='closed'/);
  assert.doesNotMatch(workflow, /merge_pull_request/);
});

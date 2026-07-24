import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/play-cert-protected-request.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('Play Store certificate extraction is owner-only and production-protected', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /\.github\/play-cert-extraction-request-v3/);
  assert.match(workflow, /github\.event_name == 'pull_request_target'/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /environment: production/);
});

test('same-repository draft request dispatch is tightly scoped and never checks out request code', () => {
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /startsWith\(github\.event\.pull_request\.head\.ref, 'ops\/dispatch-play-cert-v3-'\)/);
  assert.match(workflow, /github\.event\.pull_request\.title == 'Dispatch protected Play certificate extraction v3'/);
  assert.match(workflow, /REQUEST_DRAFT/);
  assert.match(workflow, /Request must change only \.github\/play-cert-extraction-request-v3/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.head_ref \}\}/);
});

test('certificate request cannot be merged and uses non-cancelling request-specific concurrency', () => {
  assert.match(workflow, /block_request_merge:/);
  assert.match(workflow, /Refuse request PR merge/);
  assert.match(workflow, /group: protected-play-cert-\$\{\{ github\.event_name \}\}-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('runtime status is published before protected environment access', () => {
  assert.match(workflow, /announce:/);
  assert.match(workflow, /Publish waiting-for-production status/);
  assert.match(workflow, /TRACKING_ISSUE: '478'/);
  assert.match(workflow, /WAITING_FOR_PRODUCTION_ENVIRONMENT/);
  assert.match(workflow, /Workflow run ID:/);
  assert.match(workflow, /needs: announce/);
  assert.match(workflow, /report:/);
  assert.match(workflow, /Publish protected certificate outcome/);
  assert.match(workflow, /EXTRACT_RESULT: \$\{\{ needs\.export_certificate\.result \}\}/);
  assert.doesNotMatch(workflow, /needs\.export-certificate/);
  assert.match(workflow, /Status: \\`SUCCESS\\`/);
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

  assert.match(workflow, /Inspect protected Android signing inputs/);
  assert.match(workflow, /Fail closed when protected signing inputs are missing/);
  assert.match(workflow, /base64 --decode > android\/app\/bin-group-upload\.jks/);
  assert.match(workflow, /storeFile=app\/bin-group-upload\.jks/);
  assert.match(workflow, /keytool -exportcert -rfc/);
});

test('certificate artifact excludes private signing material', () => {
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

test('certificate evidence binds to stable exact current main and workflow run', () => {
  assert.match(workflow, /Resolve stable exact current main/);
  assert.match(workflow, /first_sha=.*commits\/main/);
  assert.match(workflow, /second_sha=.*commits\/main/);
  assert.match(workflow, /ref: \$\{\{ env\.RELEASE_SHA \}\}/);
  assert.match(workflow, /commitSha:\$commitSha/);
  assert.match(workflow, /workflowRunId:\$workflowRunId/);
  assert.match(workflow, /packageName:\$packageName/);
  assert.match(workflow, /hardLaunchClaim:false/);
});

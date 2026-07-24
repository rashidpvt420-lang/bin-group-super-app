import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/extract-play-store-cert.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('Play Store certificate extraction is owner-only and production-protected', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /\.github\/play-cert-extraction-request/);
  assert.match(workflow, /github\.event_name == 'push'/);
  assert.match(workflow, /github\.event\.issue\.number == 434/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(workflow, /github\.event\.comment\.body == '\/bin-launch extract-play-store-cert'/);
  assert.match(workflow, /environment: production/);
});

test('same-repository pull request dispatch is tightly scoped and never checks out request code', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /types: \[opened, synchronize, reopened\]/);
  assert.match(workflow, /github\.event_name == 'pull_request'/);
  assert.match(workflow, /github\.event_name == 'pull_request_target'/);
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /startsWith\(github\.event\.pull_request\.head\.ref, 'ops\/dispatch-play-cert-extraction-'\)/);
  assert.match(workflow, /github\.event\.pull_request\.title == 'Dispatch protected Play certificate extraction'/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.head_ref \}\}/);
});

test('certificate extraction uses run-specific concurrency', () => {
  assert.match(workflow, /group: extract-play-store-upload-certificate-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /group: extract-play-store-upload-certificate\s*$/m);
});

test('runtime status is published before protected environment access', () => {
  assert.match(workflow, /announce:/);
  assert.match(workflow, /Publish directly readable running status/);
  assert.match(workflow, /TRACKING_ISSUE: '478'/);
  assert.match(workflow, /WAITING_FOR_PRODUCTION_ENVIRONMENT/);
  assert.match(workflow, /Workflow run ID:/);
  assert.match(workflow, /needs: announce/);
  assert.match(workflow, /report:/);
  assert.match(workflow, /Publish certificate extraction outcome/);
  assert.match(workflow, /EXTRACT_RESULT: \$\{\{ needs\.extract-certificate\.result \}\}/);
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

test('certificate evidence binds to stable exact current main and workflow run', () => {
  assert.match(workflow, /Resolve stable exact current main/);
  assert.match(workflow, /first_sha=.*commits\/main/);
  assert.match(workflow, /second_sha=.*commits\/main/);
  assert.match(workflow, /ref: \$\{\{ env\.RELEASE_SHA \}\}/);
  assert.match(workflow, /commitSha: \$commitSha/);
  assert.match(workflow, /workflowRunId: \$workflowRunId/);
  assert.match(workflow, /packageName: \$packageName/);
  assert.match(workflow, /hardLaunchClaim: false/);
});

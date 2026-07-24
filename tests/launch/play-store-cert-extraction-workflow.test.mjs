import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/pr-validation.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('active PR Validation exposes a protected certificate workflow-dispatch operation', () => {
  assert.match(workflow, /name: PR Validation/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /operation:/);
  assert.match(workflow, /export-play-certificate/);
  assert.match(workflow, /expected_commit_sha:/);
  assert.match(workflow, /request_pr:/);
  assert.match(workflow, /EXPORT_PUBLIC_PLAY_CERTIFICATE_BIN_GROUP/);
});

test('owner request dispatches only the registered main workflow and never reads signing secrets', () => {
  assert.match(workflow, /dispatch_play_certificate:/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /ops\/dispatch-play-cert-extraction-/);
  assert.match(workflow, /Dispatch protected Play certificate extraction/);
  assert.match(workflow, /Certificate request must change only \.github\/play-cert-extraction-request/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /actions\/workflows\/pr-validation\.yml\/dispatches/);
  assert.match(workflow, /inputs\[operation\]=export-play-certificate/);
  assert.match(workflow, /ref='main'/);
});

test('child run announces exact current main before the production environment gate', () => {
  assert.match(workflow, /announce_play_certificate:/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /inputs\.operation == 'export-play-certificate'/);
  assert.match(workflow, /Expected main \$EXPECTED_COMMIT_SHA but current main is \$current_main/);
  assert.match(workflow, /WAITING_FOR_PRODUCTION_ENVIRONMENT/);
  assert.match(workflow, /Workflow run ID:/);
  assert.match(workflow, /export_play_certificate:/);
  assert.match(workflow, /needs: announce_play_certificate/);
  assert.match(workflow, /environment: production/);
});

test('certificate export uses all protected Android signing secrets and fails closed', () => {
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

test('artifact is public-only and private signing material is removed', () => {
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

test('final report is sanitized and closes the request without merge', () => {
  assert.match(workflow, /report_play_certificate:/);
  assert.match(workflow, /needs: \[announce_play_certificate, export_play_certificate\]/);
  assert.match(workflow, /EXTRACT_RESULT: \$\{\{ needs\.export_play_certificate\.result \}\}/);
  assert.match(workflow, /Missing protected inputs:/);
  assert.match(workflow, /Status: \\`SUCCESS\\`/);
  assert.match(workflow, /pulls\/\$REQUEST_PR/);
  assert.match(workflow, /-f state='closed'/);
  assert.doesNotMatch(workflow, /merge_pull_request/);
});

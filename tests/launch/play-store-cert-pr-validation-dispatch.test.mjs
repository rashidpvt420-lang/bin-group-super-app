import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/pr-validation.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('PR Validation keeps ordinary validation and adds the protected certificate route', () => {
  assert.match(workflow, /validate:/);
  assert.match(workflow, /Install, typecheck, lint, and build/);
  assert.match(workflow, /dispatch_play_certificate:/);
  assert.match(workflow, /announce_play_certificate:/);
  assert.match(workflow, /export_play_certificate:/);
  assert.match(workflow, /environment: production/);
});

test('dispatcher is owner-only, same-repository, draft-only, exact-title and exact-branch scoped', () => {
  assert.match(workflow, /github\.event\.pull_request\.draft == true/);
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /startsWith\(github\.event\.pull_request\.head\.ref, 'ops\/dispatch-play-cert-extraction-'\)/);
  assert.match(workflow, /github\.event\.pull_request\.title == 'Dispatch protected Play certificate extraction'/);
});

test('dispatcher invokes the registered workflow on exact main', () => {
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /actions\/workflows\/pr-validation\.yml\/dispatches/);
  assert.match(workflow, /-f ref='main'/);
  assert.match(workflow, /inputs\[expected_commit_sha\]/);
  assert.match(workflow, /inputs\[request_pr\]/);
  assert.match(workflow, /EXPORT_PUBLIC_PLAY_CERTIFICATE_BIN_GROUP/);
});

test('protected child exports only public evidence', () => {
  assert.match(workflow, /keytool -exportcert -rfc/);
  assert.match(workflow, /bin-group-upload-certificate\.pem/);
  assert.match(workflow, /play-store-certificate-evidence\.json/);
  assert.match(workflow, /publicCertificateOnly: true/);
  assert.match(workflow, /privateKeyExcluded: true/);
  assert.match(workflow, /keystoreExcluded: true/);
  assert.match(workflow, /passwordsExcluded: true/);
  assert.match(workflow, /Verify certificate artifact allowlist/);
  assert.match(workflow, /Remove private Android signing material/);
  assert.doesNotMatch(workflow, /path:\s+android\/app\/bin-group-upload\.jks/);
  assert.doesNotMatch(workflow, /path:\s+android\/keystore\.properties/);
});

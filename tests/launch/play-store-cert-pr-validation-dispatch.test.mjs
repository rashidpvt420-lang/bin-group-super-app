import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/privileged-account-review-request.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('active protected request workflow contains both privileged review and certificate paths', () => {
  assert.match(workflow, /review:/);
  assert.match(workflow, /Review privileged accounts without mutation/);
  assert.match(workflow, /announce_play_certificate:/);
  assert.match(workflow, /export_play_certificate:/);
  assert.match(workflow, /\.github\/privileged-review-request/);
  assert.match(workflow, /\.github\/play-cert-extraction-request-v5/);
});

test('certificate authorization is exact owner, same repository, exact title and branch scoped', () => {
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /startsWith\(github\.event\.pull_request\.head\.ref, 'ops\/dispatch-play-cert-v5-'\)/);
  assert.match(workflow, /github\.event\.pull_request\.title == 'Dispatch protected Play certificate extraction v5'/);
});

test('certificate evidence is exact-main, public-only and sanitized', () => {
  assert.match(workflow, /commitSha: \$commitSha/);
  assert.match(workflow, /workflowRunId: \$workflowRunId/);
  assert.match(workflow, /packageName: \$packageName/);
  assert.match(workflow, /publicCertificateOnly: true/);
  assert.match(workflow, /privateKeyExcluded: true/);
  assert.match(workflow, /keystoreExcluded: true/);
  assert.match(workflow, /passwordsExcluded: true/);
  assert.match(workflow, /hardLaunchClaim: false/);
  assert.match(workflow, /Verify certificate artifact allowlist/);
  assert.match(workflow, /Remove private Android signing material/);
});

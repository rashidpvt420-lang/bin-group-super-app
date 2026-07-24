import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/pr-validation.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

const marker = '  review-privileged-accounts:';
const start = workflow.indexOf(marker);
assert.notEqual(start, -1, 'PR Validation must define review-privileged-accounts job');
const reviewJob = workflow.slice(start);

test('active PR Validation dispatch restricts privileged review to exact owner request', () => {
  assert.match(reviewJob, /github\.event_name == 'pull_request'/);
  assert.match(reviewJob, /github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(reviewJob, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(reviewJob, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(reviewJob, /ops\/dispatch-privileged-review-/);
  assert.match(reviewJob, /Dispatch protected privileged account review/);
});

test('privileged review job uses protected workload identity and current main only', () => {
  assert.match(reviewJob, /environment: production/);
  assert.match(reviewJob, /id-token: write/);
  assert.match(reviewJob, /workload_identity_provider: \$\{\{ secrets\.GCP_WORKLOAD_IDENTITY_PROVIDER \}\}/);
  assert.match(reviewJob, /service_account: \$\{\{ secrets\.GCP_SERVICE_ACCOUNT \}\}/);
  assert.match(reviewJob, /Resolve stable exact current main/);
  assert.match(reviewJob, /ref: \$\{\{ steps\.release\.outputs\.sha \}\}/);
  assert.match(reviewJob, /persist-credentials: false/);
  assert.doesNotMatch(reviewJob, /github\.event\.pull_request\.head\.sha/);
});

test('privileged review evidence is exact-SHA and mutation-free', () => {
  assert.match(reviewJob, /GITHUB_SHA: \$\{\{ steps\.release\.outputs\.sha \}\}/);
  assert.match(reviewJob, /GITHUB_REF: refs\/heads\/main/);
  assert.match(reviewJob, /node scripts\/review-privileged-accounts-production\.mjs/);
  assert.match(reviewJob, /\.schemaVersion == 2/);
  assert.match(reviewJob, /\.commitSha == \$sha/);
  assert.match(reviewJob, /\.mutationPerformed == false/);
  assert.match(reviewJob, /\.deletedAccountCount == 0/);
  assert.match(reviewJob, /\.deletedProfileDocumentCount == 0/);
  assert.match(reviewJob, /\.auditLogsPreserved == true/);
  assert.match(reviewJob, /\.nonPrivilegedAccountsUntouched == true/);
  assert.match(reviewJob, /\.hardLaunchClaim == false/);
});

test('privileged review exposes sanitized aggregate result and artifact', () => {
  assert.match(reviewJob, /Upload sanitized privileged review artifact/);
  assert.match(reviewJob, /launch_package\/privileged-account-cleanup\.json/);
  assert.match(reviewJob, /Canonical Founder ready/);
  assert.match(reviewJob, /Founder email verified/);
  assert.match(reviewJob, /Founder phone MFA ready/);
  assert.match(reviewJob, /Unexpected deletion targets/);
  assert.match(reviewJob, /Cleanup execution eligible/);
  assert.doesNotMatch(reviewJob, /targetIdentityHashes.*body/);
});

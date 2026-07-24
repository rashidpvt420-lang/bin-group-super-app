import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/privileged-account-review-request.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('protected owner request workflow starts on both explicit marker paths and authorizes inside jobs', () => {
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /\.github\/privileged-review-request/);
  assert.match(workflow, /\.github\/play-cert-extraction-request-v5/);
  assert.match(workflow, /Authorize exact owner request/);
  assert.match(workflow, /Reject unauthorized request visibly/);
  assert.doesNotMatch(workflow, /jobs:\s*\n\s*review:[\s\S]{0,200}\n\s*if:/);
});

test('privileged review request remains restricted to its exact owner contract', () => {
  assert.match(workflow, /BASE_REF.*github\.event\.pull_request\.base\.ref/);
  assert.match(workflow, /HEAD_REPOSITORY.*github\.event\.pull_request\.head\.repo\.full_name/);
  assert.match(workflow, /PR_AUTHOR.*github\.event\.pull_request\.user\.login/);
  assert.match(workflow, /REPOSITORY_OWNER.*github\.repository_owner/);
  assert.match(workflow, /HEAD_REF.*github\.event\.pull_request\.head\.ref/);
  assert.match(workflow, /ops\/dispatch-privileged-review-\*/);
  assert.match(workflow, /Dispatch protected privileged account review/);
  assert.match(workflow, /request_kind='privileged-review'/);
});

test('privileged review uses protected workload identity and trusted current main only', () => {
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /workload_identity_provider: \$\{\{ secrets\.GCP_WORKLOAD_IDENTITY_PROVIDER \}\}/);
  assert.match(workflow, /service_account: \$\{\{ secrets\.GCP_SERVICE_ACCOUNT \}\}/);
  assert.match(workflow, /Resolve stable exact current main/);
  assert.match(workflow, /ref: \$\{\{ steps\.release\.outputs\.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
});

test('privileged review binds evidence to main and proves no mutation', () => {
  assert.match(workflow, /GITHUB_SHA: \$\{\{ steps\.release\.outputs\.sha \}\}/);
  assert.match(workflow, /GITHUB_REF: refs\/heads\/main/);
  assert.match(workflow, /node scripts\/review-privileged-accounts-production\.mjs/);
  assert.match(workflow, /\.schemaVersion == 2/);
  assert.match(workflow, /\.commitSha == \$sha/);
  assert.match(workflow, /\.mutationPerformed == false/);
  assert.match(workflow, /\.deletedAccountCount == 0/);
  assert.match(workflow, /\.nonPrivilegedAccountsUntouched == true/);
  assert.match(workflow, /\.hardLaunchClaim == false/);
});

test('privileged review publishes only sanitized aggregate evidence', () => {
  assert.match(workflow, /Upload sanitized privileged review artifact/);
  assert.match(workflow, /launch_package\/privileged-account-cleanup\.json/);
  assert.match(workflow, /Canonical Founder ready/);
  assert.match(workflow, /Unexpected deletion targets/);
  assert.match(workflow, /Mutation performed/);
  assert.doesNotMatch(workflow, /targetIdentityHashes.*body/);
});

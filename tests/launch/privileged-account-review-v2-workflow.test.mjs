import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/privileged-account-review-v2.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('privileged review v2 is an isolated trusted-base request workflow', () => {
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /\.github\/privileged-review-request-v2/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /Authorize canonical one-file owner request/);
  assert.doesNotMatch(workflow, /jobs:\s*\n\s*review:[\s\S]{0,200}\n\s*if:/);
});

test('privileged review v2 accepts only the exact owner one-file contract', () => {
  assert.match(workflow, /PR_AUTHOR.*github\.event\.pull_request\.user\.login/);
  assert.match(workflow, /REPOSITORY_OWNER.*github\.repository_owner/);
  assert.match(workflow, /ops\/dispatch-privileged-review-v2-\*/);
  assert.match(workflow, /Dispatch protected privileged account review v2/);
  assert.match(workflow, /Request must change only \.github\/privileged-review-request-v2/);
  assert.match(workflow, /request=review-privileged-accounts-v2/);
  assert.match(workflow, /mutation_allowed=false/);
  assert.match(workflow, /hard_launch_claim=false/);
});

test('privileged review v2 executes only exact current main and proves no mutation', () => {
  assert.match(workflow, /Resolve stable exact current main/);
  assert.match(workflow, /ref: \$\{\{ steps\.release\.outputs\.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(workflow, /node scripts\/review-privileged-accounts-production\.mjs/);
  assert.match(workflow, /\.schemaVersion == 2/);
  assert.match(workflow, /\.mutationPerformed == false/);
  assert.match(workflow, /\.deletedAccountCount == 0/);
  assert.match(workflow, /\.nonPrivilegedAccountsUntouched == true/);
  assert.match(workflow, /\.hardLaunchClaim == false/);
});

test('privileged review v2 publishes sanitized aggregate evidence only', () => {
  assert.match(workflow, /Upload sanitized privileged review artifact/);
  assert.match(workflow, /Canonical Founder ready/);
  assert.match(workflow, /Unexpected deletion targets/);
  assert.match(workflow, /Mutation performed/);
  assert.doesNotMatch(workflow, /targetIdentityHashes.*body/);
});

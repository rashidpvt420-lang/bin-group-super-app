import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/privileged-account-review-v3.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('privileged review v3 runs only for a trusted main marker push', () => {
  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /\.github\/privileged-review-request-v3/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.doesNotMatch(workflow, /issue_comment:/);
});

test('privileged review v3 validates the exact one-file merge contract', () => {
  assert.match(workflow, /Authorize canonical main marker merge/);
  assert.match(workflow, /Dispatch commit must change only \.github\/privileged-review-request-v3/);
  assert.match(workflow, /\[\[ "\$request" == 'review-privileged-accounts-v3' \]\]/);
  assert.match(workflow, /requested_from_main/);
  assert.match(workflow, /mutation_allowed/);
  assert.match(workflow, /hard_launch_claim/);
  assert.match(workflow, /request_nonce/);
  assert.match(workflow, /\.parents\[0\]\.sha/);
});

test('privileged review v3 executes only exact current main and proves no mutation', () => {
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node scripts\/review-privileged-accounts-production\.mjs/);
  assert.match(workflow, /\.schemaVersion == 2/);
  assert.match(workflow, /\.commitSha == \$sha/);
  assert.match(workflow, /\.mutationPerformed == false/);
  assert.match(workflow, /\.deletedAccountCount == 0/);
  assert.match(workflow, /\.nonPrivilegedAccountsUntouched == true/);
  assert.match(workflow, /\.hardLaunchClaim == false/);
});

test('privileged review v3 publishes only sanitized aggregate evidence', () => {
  assert.match(workflow, /Upload sanitized privileged review artifact/);
  assert.match(workflow, /Canonical Founder ready/);
  assert.match(workflow, /Unexpected deletion targets/);
  assert.match(workflow, /Mutation performed/);
  assert.doesNotMatch(workflow, /targetIdentityHashes.*body/);
});

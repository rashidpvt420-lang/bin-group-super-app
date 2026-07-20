import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('privileged cleanup review is protected, exact-main and non-destructive', async () => {
  const [workflow, review, cleanup, authority] = await Promise.all([
    read('.github/workflows/privileged-account-cleanup-dry-run.yml'),
    read('scripts/review-privileged-accounts-production.mjs'),
    read('scripts/delete-obsolete-privileged-accounts-production.mjs'),
    read('scripts/verify-admin-mfa-production.mjs'),
  ]);

  assert.match(workflow, /name: Privileged Account Cleanup Dry Run/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /GCP_PROJECT_ID: bin-group-57c60/);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /REVIEW_PRIVILEGED_ACCOUNT_CLEANUP_BIN_GROUP/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /review-privileged-accounts-production\.mjs/);
  assert.doesNotMatch(workflow, /delete-obsolete-privileged-accounts-production\.mjs/);
  assert.doesNotMatch(workflow, /--execute/);
  assert.doesNotMatch(workflow, /DELETE_ALL_OTHER_PRIVILEGED_ACCOUNTS_BIN_GROUP/);
  assert.match(workflow, /Mutation performed: `false`/);
  assert.match(workflow, /Deletion performed: `false`/);
  assert.match(workflow, /Non-privileged accounts untouched/);

  assert.match(review, /import \{[\s\S]*CANONICAL_FOUNDER_EMAIL/);
  assert.match(authority, /export const CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups\.com'/);
  assert.match(review, /mutationPerformed: false/);
  assert.match(review, /nonPrivilegedAccountsUntouched: true/);
  assert.match(review, /auditLogsPreserved: true/);
  assert.match(review, /executionBlockers/);
  assert.doesNotMatch(review, /deleteUser\(|updateUser\(|revokeRefreshTokens\(|\.delete\(/);

  assert.match(cleanup, /DELETE_ALL_OTHER_PRIVILEGED_ACCOUNTS_BIN_GROUP/);
  assert.match(cleanup, /deleteUser\(/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('privileged cleanup review is protected, exact-main and non-destructive', async () => {
  const workflow = await read('.github/workflows/privileged-account-cleanup-dry-run.yml');
  const cleanup = await read('scripts/delete-obsolete-privileged-accounts-production.mjs');

  assert.match(workflow, /name: Privileged Account Cleanup Dry Run/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /GCP_PROJECT_ID: bin-group-57c60/);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /REVIEW_PRIVILEGED_ACCOUNT_CLEANUP_BIN_GROUP/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /delete-obsolete-privileged-accounts-production\.mjs/);
  assert.doesNotMatch(workflow, /--execute/);
  assert.doesNotMatch(workflow, /DELETE_ALL_OTHER_PRIVILEGED_ACCOUNTS_BIN_GROUP/);
  assert.match(workflow, /Deletion performed: `false`/);
  assert.match(workflow, /Non-privileged accounts untouched/);

  assert.match(cleanup, /CANONICAL_FOUNDER_EMAIL/);
  assert.match(cleanup, /ceo@bin-groups\.com/);
  assert.match(cleanup, /nonPrivilegedAccountsUntouched: true/);
  assert.match(cleanup, /auditLogsPreserved: true/);
});

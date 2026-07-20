import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/privileged-account-cleanup-production.yml', import.meta.url),
  'utf8',
);

test('privileged cleanup workflow is production-protected and exact-main only', () => {
  assert.match(workflow, /name: Privileged Account Cleanup - Production/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /REVIEW_SINGLE_FOUNDER_PRIVILEGED_ACCOUNTS/);
  assert.match(workflow, /DELETE_ALL_OTHER_PRIVILEGED_ACCOUNTS_BIN_GROUP/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /GCP_PROJECT_ID: bin-group-57c60/);
  assert.match(workflow, /DEPLOYMENT_ENVIRONMENT: production/);
});

test('privileged cleanup always performs a dry run before destructive execution', () => {
  const dryRun = workflow.indexOf('Produce non-destructive privileged-account inventory');
  const execute = workflow.indexOf('Execute protected privileged-account cleanup');
  const verify = workflow.indexOf('Verify canonical founder production authority');
  assert.ok(dryRun >= 0);
  assert.ok(execute > dryRun);
  assert.ok(verify > execute);
  assert.match(workflow, /node scripts\/delete-obsolete-privileged-accounts-production\.mjs\n/);
  assert.match(workflow, /node scripts\/delete-obsolete-privileged-accounts-production\.mjs --execute/);
  assert.match(workflow, /if: \$\{\{ inputs\.execute_cleanup \}\}/);
});

test('privileged cleanup publishes evidence and excludes unrelated portal accounts', () => {
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /launch_package\/privileged-account-cleanup\.json/);
  assert.match(workflow, /Audit logs preserved: required/);
  assert.match(workflow, /Non-privileged Owner, Tenant, Technician and Broker accounts: excluded/);
  assert.match(workflow, /Hard-launch claim: false/);
  assert.doesNotMatch(workflow, /firebase\s+deploy/i);
});

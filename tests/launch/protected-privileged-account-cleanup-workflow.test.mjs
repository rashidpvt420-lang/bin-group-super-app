import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/privileged-account-cleanup-production.yml', import.meta.url),
  'utf8',
);

const deployWorkflow = await readFile(
  new URL('../../.github/workflows/firebase-production-deploy.yml', import.meta.url),
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
  assert.match(workflow, /EXPECTED_COMMIT_SHA:\s*\$\{\{ inputs\.expected_commit_sha \}\}/);
  assert.match(workflow, /\[\[ "\$EXPECTED_COMMIT_SHA" == "\$GITHUB_SHA" \]\]/);
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
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.doesNotMatch(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /launch_package\/privileged-account-cleanup\.json/);
  assert.match(workflow, /Audit logs preserved: required/);
  assert.match(workflow, /Non-privileged Owner, Tenant, Technician and Broker accounts: excluded/);
  assert.match(workflow, /Hard-launch claim: false/);
  assert.doesNotMatch(workflow, /firebase\s+deploy/i);
});

test('production deploy workflow removes unexpected privileged accounts before deploying', () => {
  const cleanupStep = deployWorkflow.indexOf('Remove unexpected privileged Firebase accounts');
  const deployStep = deployWorkflow.indexOf('Deploy and verify Firebase production stack');
  assert.ok(cleanupStep >= 0, 'deploy workflow must include a privileged-account cleanup step');
  assert.ok(deployStep >= 0, 'deploy workflow must include the Firebase deploy step');
  assert.ok(deployStep > cleanupStep, 'privileged-account cleanup must precede the Firebase deploy step');
  assert.match(
    deployWorkflow,
    /delete-obsolete-privileged-accounts-production\.mjs --execute/,
    'deploy workflow must run cleanup in execute mode',
  );
  assert.match(
    deployWorkflow,
    /PRIVILEGED_ACCOUNT_CLEANUP_CONFIRMATION: DELETE_ALL_OTHER_PRIVILEGED_ACCOUNTS_BIN_GROUP/,
    'deploy workflow must set the exact cleanup confirmation',
  );
  assert.match(
    deployWorkflow,
    /CANONICAL_FOUNDER_EMAIL_CONFIRMATION: ceo@bin-groups\.com/,
    'deploy workflow must confirm the canonical founder email',
  );
  assert.match(
    deployWorkflow,
    /DEPLOYMENT_ENVIRONMENT: production/,
    'cleanup step must run under the production deployment environment',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [workflow, dispatcher, migration] = await Promise.all([
  readFile(new URL('../../.github/workflows/private-hr-migration.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/private-hr-migration-dispatch-current-main.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/migrate-private-hr-profiles.mjs', import.meta.url), 'utf8'),
]);

test('private HR migration is protected, exact-main and dry-run-first', () => {
  assert.match(workflow, /environment:\s*hard-launch-operations/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS:\s*\$\{\{ secrets\.AUTHORIZED_FOUNDER_ACTORS \}\}/);
  assert.match(workflow, /TARGET_SHA.*inputs\.expected_commit_sha/);
  assert.match(workflow, /\[\[ "\$TARGET_SHA" == "\$GITHUB_SHA" \]\]/);
  assert.match(workflow, /REVIEW_PRIVATE_HR_MIGRATION_BIN_GROUP/);
  assert.match(workflow, /MIGRATE_PRIVATE_HR_BIN_GROUP_57C60/);
  assert.match(workflow, /if: inputs\.mode == 'dry-run'/);
  assert.match(workflow, /if: inputs\.mode == 'execute'/);
  assert.match(workflow, /workflow_call:/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test('START HERE dispatcher binds current main without a manually copied SHA', () => {
  assert.match(dispatcher, /name: START HERE - Private HR Data Migration/);
  assert.match(dispatcher, /uses: \.\/\.github\/workflows\/private-hr-migration\.yml/);
  assert.match(dispatcher, /expected_commit_sha:\s*\$\{\{ github\.sha \}\}/);
  assert.match(dispatcher, /mode:\s*\$\{\{ inputs\.mode \}\}/);
  assert.match(dispatcher, /confirmation:\s*\$\{\{ inputs\.confirmation \}\}/);
  assert.match(dispatcher, /secrets:\s*inherit/);
  assert.match(dispatcher, /default:\s*dry-run/);

  const inputSection = dispatcher.slice(dispatcher.indexOf('    inputs:'), dispatcher.indexOf('\npermissions:'));
  assert.doesNotMatch(inputSection, /expected_commit_sha:/);
  assert.doesNotMatch(dispatcher, /firebase deploy|deploy-firebase-production|migrate-private-hr-profiles\.mjs/);
});

test('stale and unauthorized migration runs fail with actionable diagnostics', () => {
  assert.match(workflow, /Stale SHA: expected_commit_sha=\$TARGET_SHA/);
  assert.match(workflow, /Start a new START HERE - Private HR Data Migration run instead of rerunning this job/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS is not configured/);
  assert.match(workflow, /GitHub actor \$GITHUB_ACTOR is not authorized/);
  assert.match(workflow, /Dry-run confirmation must equal REVIEW_PRIVATE_HR_MIGRATION_BIN_GROUP/);
  assert.match(workflow, /Execute confirmation must equal MIGRATE_PRIVATE_HR_BIN_GROUP_57C60/);
  assert.match(workflow, /Migration mode must be dry-run or execute/);
});

test('private HR migration uses Node 24-compatible action runtimes', () => {
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /google-github-actions\/auth@v3/);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02\s+# v4/);
  assert.doesNotMatch(workflow, /actions\/checkout@v4/);
  assert.doesNotMatch(workflow, /actions\/setup-node@v4/);
  assert.doesNotMatch(workflow, /google-github-actions\/auth@v2/);
  assert.doesNotMatch(workflow, /actions\/upload-artifact@v7/);
});

test('migration moves sensitive values and verifies deletion without logging them', () => {
  assert.match(migration, /db\.collection\('private_hr_profiles'\)/);
  assert.match(migration, /FieldValue\.delete\(\)/);
  assert.match(migration, /post-migration verification failed/);
  assert.match(migration, /sensitiveValuesLogged:\s*false/);
  assert.match(migration, /rawIdentifiersLogged:\s*false/);
  assert.match(migration, /uidHash:\s*hashId\(candidate\.uid\)/);
  assert.doesNotMatch(migration, /console\.log\([^\n]*(?:emiratesId|salaryPackage|employeeId|candidate\.uid)/);
});

test('dry-run report makes the execute-or-skip decision explicit', () => {
  assert.match(migration, /const executionRequired = candidates\.length > 0/);
  assert.match(migration, /SKIP_EXECUTE_PROCEED_TO_BANK_PILOT/);
  assert.match(migration, /REVIEW_REPORT_THEN_EXECUTE/);
  assert.match(migration, /executionRequired,/);
  assert.match(migration, /recommendedNextAction,/);
  assert.match(workflow, /Execution required:/);
  assert.match(workflow, /Recommended next action:/);
});

test('migration execution cannot run locally or against another project\/ref', () => {
  assert.match(migration, /execution requires GitHub Actions/);
  assert.match(migration, /repository mismatch/);
  assert.match(migration, /execution requires refs\/heads\/main/);
  assert.match(migration, /execution confirmation mismatch/);
  assert.match(migration, /GitHub actor is not an authorized Founder approver/);
  assert.equal((migration.match(/const PROJECT_ID = 'bin-group-57c60'/g) || []).length, 1);
});

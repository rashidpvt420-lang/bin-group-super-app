import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [workflow, migration] = await Promise.all([
  readFile(new URL('../../.github/workflows/private-hr-migration.yml', import.meta.url), 'utf8'),
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
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
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

test('migration execution cannot run locally or against another project/ref', () => {
  assert.match(migration, /execution requires GitHub Actions/);
  assert.match(migration, /repository mismatch/);
  assert.match(migration, /execution requires refs\/heads\/main/);
  assert.match(migration, /execution confirmation mismatch/);
  assert.match(migration, /GitHub actor is not an authorized Founder approver/);
  assert.equal((migration.match(/const PROJECT_ID = 'bin-group-57c60'/g) || []).length, 1);
});

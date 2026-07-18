import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('production Admin MFA preflight requires a profile-backed two-person recovery quorum', async () => {
  const source = await read('scripts/verify-admin-mfa-production.mjs');
  expectAll(source, [
    /RECOVERY_APPROVER_ROLES = new Set\(\['ceo', 'super_admin'\]\)/,
    /recoveryApproverCandidateCount < 2/,
    /recoveryApproverMfaReadyCount < 2/,
    /recoveryApproverEmailUnverifiedCount/,
    /recoveryApproverMissingPhoneFactorCount/,
    /profileExists === false/,
    /INACTIVE_PROFILE_STATUSES/,
    /db\.collection\('users'\)\.doc\(user\.uid\)/,
    /await db\.getAll/,
    /schemaVersion: 2/,
    /recoveryQuorumReady/,
    /sensitiveValuesExcluded: true/,
  ], 'Admin MFA production quorum');
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:email|phoneNumber|factorUid|displayName)/i);
});

test('protected deployment embeds quorum evidence before exact-SHA production verification', async () => {
  const source = await read('scripts/deploy-firebase-production.mjs');
  const preflight = source.indexOf('await verifyAdminMfaProduction');
  const deploy = source.search(/retryFirebase\(\s*['"]functions,hosting,firestore:rules,firestore:indexes,storage['"]/);
  const evidence = source.indexOf('deploymentMetadata.adminMfa = adminMfaEvidence');
  const verify = source.indexOf("'scripts/verify-production-deployment.mjs'");
  assert.ok(preflight >= 0 && deploy > preflight, 'Admin MFA quorum must run before deployment');
  assert.ok(evidence > deploy, 'Admin MFA evidence must be embedded after successful deployment metadata creation');
  assert.ok(verify > evidence, 'same-run production verification must validate the embedded quorum evidence');
});

test('operator guidance prohibits using the ordinary E2E Admin as a recovery approver', async () => {
  const source = await read('docs/admin-mfa-recovery-production-quorum.md');
  expectAll(source, [
    /At least two distinct Firebase Authentication accounts/,
    /`ceo` or `super_admin`/,
    /ordinary `E2E_ADMIN_EMAIL` test account/,
    /never records UIDs, email addresses, phone numbers, factor identifiers, display names, or SMS codes/,
    /does not authorize a recovery request/,
  ], 'Admin MFA recovery operator guidance');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('production Admin MFA preflight requires exactly one canonical founder account', async () => {
  const source = await read('scripts/verify-admin-mfa-production.mjs');
  expectAll(source, [
    /CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups\.com'/,
    /claimedAdminCount === 1/,
    /unexpectedPrivilegedAccountCount === 0/,
    /canonicalFounderCandidateCount === 1/,
    /canonicalFounderMfaReadyCount === 1/,
    /founderSingletonReady/,
    /profileExists === false/,
    /INACTIVE_PROFILE_STATUSES/,
    /db\.collection\('users'\)\.doc\(user\.uid\)/,
    /await db\.getAll/,
    /schemaVersion: 3/,
    /sensitiveValuesExcluded: true/,
  ], 'Admin single-founder production authority');
  assert.doesNotMatch(source, /recoveryApproverCandidateCount < 2/);
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:email|phoneNumber|factorUid|displayName)/i);
});

test('protected deployment embeds single-founder evidence before exact-SHA production verification', async () => {
  const source = await read('scripts/deploy-firebase-production.mjs');
  const preflight = source.indexOf('await verifyAdminMfaProduction');
  const deploy = source.search(/retryFirebase\(\s*['"]functions,hosting,firestore:rules,firestore:indexes,storage['"]/);
  const evidence = source.indexOf('deploymentMetadata.adminMfa = adminMfaEvidence');
  const verify = source.indexOf("'scripts/verify-production-deployment.mjs'");
  assert.ok(preflight >= 0 && deploy > preflight, 'single-founder Admin MFA must run before deployment');
  assert.ok(evidence > deploy, 'Admin MFA evidence must be embedded after successful deployment metadata creation');
  assert.ok(verify > evidence, 'same-run production verification must validate embedded founder evidence');
});

test('operator guidance states the canonical one-founder authority model', async () => {
  const source = await read('docs/admin-mfa-recovery-production-quorum.md');
  expectAll(source, [
    /exactly one privileged Firebase Authentication account/i,
    /`ceo@bin-groups\.com`/,
    /email is verified/i,
    /phone MFA/i,
    /all other privileged accounts must be deleted/i,
    /never records UIDs, email addresses, phone numbers, factor identifiers, display names, or SMS codes/i,
  ], 'Admin single-founder operator guidance');
});

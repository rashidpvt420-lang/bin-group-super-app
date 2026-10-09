import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('production Admin MFA preflight requires canonical Founder plus one Finance Admin', async () => {
  const source = await read('scripts/verify-admin-mfa-production.mjs');
  expectAll(source, [
    /CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups\.com'/,
    /claimedAdminCount === 2/,
    /unexpectedPrivilegedAccountCount === 0/,
    /canonicalFounderCandidateCount === 1/,
    /canonicalFounderMfaReadyCount === 1/,
    /dualControlReady/,
    /profileExists === false/,
    /INACTIVE_PROFILE_STATUSES/,
    /db\.collection\('users'\)\.doc\(user\.uid\)/,
    /await db\.getAll/,
    /schemaVersion: 4/,
    /sensitiveValuesExcluded: true/,
    /financeApproverCandidateCount === 1/,
    /financeApproverMfaReadyCount === 1/,
  ], 'Admin Founder plus Finance dual-control authority');
  assert.doesNotMatch(source, /recoveryApproverCandidateCount < 2/);
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:email|phoneNumber|factorUid|displayName)/i);
});

test('protected deployment embeds Founder plus Finance evidence before exact-SHA production verification', async () => {
  const source = await read('scripts/deploy-firebase-production.mjs');
  const preflight = source.indexOf('await verifyAdminMfaProduction');
  const functionsDeploy = source.indexOf('const functionDeploymentEvidence = deployFunctionsQuotaSafe()');
  const nonFunctionsDeploy = source.indexOf("'non-Functions Firebase production stack'");
  const evidence = source.indexOf('deploymentMetadata.adminMfa = adminMfaEvidence');
  const verify = source.indexOf("'scripts/verify-production-deployment.mjs'");
  assert.ok(preflight >= 0 && functionsDeploy > preflight, 'dual-control Admin MFA must run before Functions deployment');
  assert.ok(nonFunctionsDeploy > functionsDeploy, 'non-Functions resources must deploy after quota-safe Functions batches');
  assert.ok(evidence > nonFunctionsDeploy, 'Admin MFA evidence must be embedded after successful deployment metadata creation');
  assert.ok(verify > evidence, 'same-run production verification must validate embedded founder evidence');
  assert.doesNotMatch(source, /functions,hosting,firestore:rules,firestore:indexes,storage/);
});

test('operator guidance is updated away from the retired single-founder authority model', async () => {
  const source = await read('docs/admin-mfa-recovery-production-quorum.md');
  assert.match(source, /`ceo@bin-groups\.com`/);
  assert.match(source, /phone MFA/i);
  assert.match(source, /never records UIDs, email addresses, phone numbers, factor identifiers, display names, or SMS codes/i);
});

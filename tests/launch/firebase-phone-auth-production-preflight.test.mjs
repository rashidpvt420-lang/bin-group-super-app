import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildFirebasePhoneAuthEvidence,
  validateFirebasePhoneAuthConfig,
  validateFirebasePhoneAuthEvidence,
} from '../../scripts/verify-firebase-phone-auth-production.mjs';

const SHA = 'a'.repeat(40);
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const REF = 'refs/heads/main';
const RUN_ID = '991122';
const RUN_ATTEMPT = 2;

const validConfig = {
  name: 'projects/bin-group-57c60/config',
  signIn: {
    phoneNumber: {
      enabled: true,
      testPhoneNumbers: {
        '+971500000001': '123456',
      },
    },
  },
  authorizedDomains: [
    'bin-group-57c60.web.app',
    'bin-group-57c60.firebaseapp.com',
    'app.bingroup.ae',
  ],
  smsRegionConfig: {
    allowlistOnly: {
      allowedRegions: ['AE'],
    },
  },
};

const evidenceEnv = {
  GITHUB_SHA: SHA,
  GITHUB_REPOSITORY: REPOSITORY,
  GITHUB_REF: REF,
  GITHUB_RUN_ID: RUN_ID,
  GITHUB_RUN_ATTEMPT: String(RUN_ATTEMPT),
};

function buildValidEvidence(now = new Date()) {
  const configResult = validateFirebasePhoneAuthConfig(validConfig);
  assert.equal(configResult.ok, true);
  return buildFirebasePhoneAuthEvidence(configResult.summary, {
    env: evidenceEnv,
    now,
  });
}

function evidenceFailures(evidence, now = Date.now()) {
  return validateFirebasePhoneAuthEvidence(evidence, {
    commitSha: SHA,
    repository: REPOSITORY,
    ref: REF,
    workflowRunId: RUN_ID,
    workflowRunAttempt: RUN_ATTEMPT,
    now,
  });
}

test('Firebase Phone Auth production preflight accepts enabled provider, production domains, and UAE allowlist', () => {
  const result = validateFirebasePhoneAuthConfig(validConfig);
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.equal(result.summary.phoneProviderEnabled, true);
  assert.equal(result.summary.requiredDomainsPresent, true);
  assert.equal(result.summary.smsPolicy, 'allowlist-only');
  assert.equal(result.summary.requiredSmsRegionAllowed, true);
  assert.equal(result.summary.testPhoneNumberCount, 1);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /\+971500000001/);
  assert.doesNotMatch(serialized, /123456/);
});

test('Firebase Phone Auth production preflight rejects disabled provider and missing production domains', () => {
  const result = validateFirebasePhoneAuthConfig({
    ...validConfig,
    signIn: { phoneNumber: { enabled: false } },
    authorizedDomains: ['example.com'],
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /Phone provider is not enabled/);
  assert.match(result.failures.join('\n'), /bin-group-57c60\.web\.app/);
  assert.match(result.failures.join('\n'), /bin-group-57c60\.firebaseapp\.com/);
});

test('Firebase Phone Auth production preflight requires explicit UAE allowlist-only SMS policy', () => {
  const denylist = validateFirebasePhoneAuthConfig({
    ...validConfig,
    smsRegionConfig: { allowByDefault: { disallowedRegions: [] } },
  });
  assert.equal(denylist.ok, false);
  assert.match(denylist.failures.join('\n'), /allowlist-only/);

  const missingUae = validateFirebasePhoneAuthConfig({
    ...validConfig,
    smsRegionConfig: { allowlistOnly: { allowedRegions: ['US'] } },
  });
  assert.equal(missingUae.ok, false);
  assert.match(missingUae.failures.join('\n'), /does not include AE/);
});

test('Phone Auth evidence is exact-SHA bound and contains aggregate values only', () => {
  const now = new Date('2026-07-17T20:00:00.000Z');
  const evidence = buildValidEvidence(now);

  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.source, 'identity-toolkit-admin-v2');
  assert.equal(evidence.commitSha, SHA);
  assert.equal(evidence.repository, REPOSITORY);
  assert.equal(evidence.ref, REF);
  assert.equal(evidence.workflowRunId, RUN_ID);
  assert.equal(evidence.workflowRunAttempt, RUN_ATTEMPT);
  assert.equal(evidence.sensitiveValuesExcluded, true);
  assert.equal(evidence.hardLaunchClaim, false);
  assert.deepEqual(evidenceFailures(evidence, now.getTime()), []);

  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /\+971500000001/);
  assert.doesNotMatch(serialized, /123456/);
  assert.doesNotMatch(serialized, /testPhoneNumbers|accessToken|verificationCode/);
});

test('Phone Auth evidence rejects provenance, policy, timestamp, and sensitive-field tampering', () => {
  const now = new Date('2026-07-17T20:00:00.000Z');
  const cases = [
    ['commitSha', 'b'.repeat(40), /commitSha/],
    ['workflowRunId', '123', /workflowRunId/],
    ['phoneProviderEnabled', false, /provider enabled/],
    ['requiredDomainsPresent', false, /required domains/],
    ['smsPolicy', 'allow-by-default', /SMS policy/],
    ['requiredSmsRegionAllowed', false, /required SMS region allowed/],
    ['hardLaunchClaim', true, /hardLaunchClaim/],
    ['verifiedAt', '2020-01-01T00:00:00.000Z', /stale/],
  ];

  for (const [field, value, pattern] of cases) {
    const evidence = buildValidEvidence(now);
    evidence[field] = value;
    assert.match(evidenceFailures(evidence, now.getTime()).join('\n'), pattern);
  }

  const sensitive = buildValidEvidence(now);
  sensitive.phoneNumber = '+971500000001';
  assert.match(evidenceFailures(sensitive, now.getTime()).join('\n'), /must not contain phoneNumber/);
});

test('protected production deploy checks config, embeds evidence, and verifies it before success', async () => {
  const deploy = await readFile(new URL('../../scripts/deploy-firebase-production.mjs', import.meta.url), 'utf8');
  const secretsImport = deploy.indexOf('verifyFirebaseProductionSecrets');
  const phoneImport = deploy.indexOf('verifyFirebasePhoneAuthProduction');
  const secretsCall = deploy.indexOf('await verifyFirebaseProductionSecrets');
  const phoneCall = deploy.indexOf('await verifyFirebasePhoneAuthProduction');
  const deployCall = deploy.indexOf("retryFirebase(\n  'functions,hosting,firestore:rules,firestore:indexes,storage'");
  const metadataCall = deploy.indexOf("'scripts/write-production-deployment-metadata.mjs'");
  const embedCall = deploy.indexOf('deploymentMetadata.firebasePhoneAuth = phoneAuthEvidence');
  const verifyCall = deploy.indexOf("'scripts/verify-production-deployment.mjs'");

  assert.ok(secretsImport >= 0, 'production secret preflight import must remain present');
  assert.ok(phoneImport > secretsImport, 'Phone Auth preflight import must be explicit');
  assert.ok(secretsCall >= 0, 'production secret preflight must execute');
  assert.ok(phoneCall > secretsCall, 'Phone Auth config must be checked after authenticated secret metadata');
  assert.ok(deployCall > phoneCall, 'Phone Auth config must be checked before any Firebase deploy attempt');
  assert.ok(metadataCall > deployCall, 'deployment metadata must be written only after deployment succeeds');
  assert.ok(embedCall > metadataCall, 'Phone Auth evidence must be embedded into generated deployment metadata');
  assert.ok(verifyCall > embedCall, 'live deployment verification must validate the embedded Phone Auth evidence');
  assert.match(deploy, /Could not bind Firebase Phone Auth evidence to deployment metadata/);
});

test('deployment verifier requires nested Phone Auth evidence before writing passed proof', async () => {
  const deploymentVerifier = await readFile(new URL('../../scripts/verify-production-deployment.mjs', import.meta.url), 'utf8');
  assert.match(deploymentVerifier, /validateFirebasePhoneAuthEvidence/);
  assert.match(deploymentVerifier, /existing\.firebasePhoneAuth/);
  assert.match(deploymentVerifier, /commitSha/);
  assert.match(deploymentVerifier, /existing\.workflowRunId/);
  assert.match(deploymentVerifier, /for \(const phoneAuthFailure/);
});

test('Phone Auth verifier uses Identity Toolkit config API and emits only aggregate configuration evidence', async () => {
  const verifier = await readFile(new URL('../../scripts/verify-firebase-phone-auth-production.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /identitytoolkit\.googleapis\.com\/admin\/v2\/projects/);
  assert.match(verifier, /credential\.getAccessToken\(\)/);
  assert.match(verifier, /signIn\?\.phoneNumber\?\.enabled/);
  assert.match(verifier, /authorizedDomains/);
  assert.match(verifier, /smsRegionConfig\?\.allowlistOnly\?\.allowedRegions/);
  assert.match(verifier, /testPhoneNumberCount/);
  assert.match(verifier, /sensitiveValuesExcluded: true/);
  assert.doesNotMatch(verifier, /console\.log\([^\n]*testPhoneNumbers/);
});

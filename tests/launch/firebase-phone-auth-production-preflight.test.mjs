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
  name: 'projects/123413252227/config',
  signIn: { phoneNumber: { enabled: true } },
  mfa: { state: 'ENABLED' },
  authorizedDomains: ['bin-group-57c60.web.app', 'bin-group-57c60.firebaseapp.com'],
  smsRegionConfig: { allowlistOnly: { allowedRegions: ['AE'] } },
};
const evidenceEnv = {
  GITHUB_SHA: SHA,
  GITHUB_REPOSITORY: REPOSITORY,
  GITHUB_REF: REF,
  GITHUB_RUN_ID: RUN_ID,
  GITHUB_RUN_ATTEMPT: String(RUN_ATTEMPT),
};

function buildValidEvidence(now = new Date()) {
  const result = validateFirebasePhoneAuthConfig(validConfig);
  assert.equal(result.ok, true, result.failures.join('\n'));
  return buildFirebasePhoneAuthEvidence(result.summary, { env: evidenceEnv, now });
}

function failures(evidence, now = Date.now()) {
  return validateFirebasePhoneAuthEvidence(evidence, {
    commitSha: SHA,
    repository: REPOSITORY,
    ref: REF,
    workflowRunId: RUN_ID,
    workflowRunAttempt: RUN_ATTEMPT,
    now,
  });
}

test('Phone Auth production config requires provider, MFA, domains, UAE allowlist, and zero test numbers', () => {
  const result = validateFirebasePhoneAuthConfig(validConfig);
  assert.equal(result.ok, true, result.failures.join('\n'));
  assert.equal(result.summary.phoneProviderEnabled, true);
  assert.equal(result.summary.mfaState, 'ENABLED');
  assert.equal(result.summary.mfaEnabled, true);
  assert.equal(result.summary.requiredDomainsPresent, true);
  assert.equal(result.summary.requiredSmsRegionAllowed, true);
  assert.equal(result.summary.testPhoneNumberCount, 0);

  const mandatory = validateFirebasePhoneAuthConfig({ ...validConfig, mfa: { state: 'MANDATORY' } });
  assert.equal(mandatory.ok, true);
  assert.equal(mandatory.summary.mfaState, 'MANDATORY');

  const disabled = validateFirebasePhoneAuthConfig({
    ...validConfig,
    signIn: { phoneNumber: { enabled: false } },
    mfa: { state: 'DISABLED' },
    authorizedDomains: ['example.invalid'],
    smsRegionConfig: { allowByDefault: { disallowedRegions: [] } },
  });
  assert.equal(disabled.ok, false);
  assert.match(disabled.failures.join('\n'), /Phone provider is not enabled/);
  assert.match(disabled.failures.join('\n'), /multi-factor authentication must be enabled/);
  assert.match(disabled.failures.join('\n'), /missing authorized domain/);
  assert.match(disabled.failures.join('\n'), /allowlist-only/);
});

test('Phone Auth production config rejects every configured static test phone number', () => {
  const result = validateFirebasePhoneAuthConfig({
    ...validConfig,
    signIn: {
      phoneNumber: {
        enabled: true,
        testPhoneNumbers: {
          '+971500000001': '123456',
        },
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.summary.testPhoneNumberCount, 1);
  assert.match(result.failures.join('\n'), /test phone numbers must be removed before production launch/);
});

test('Phone Auth evidence is exact-run bound and proves production test numbers are absent', () => {
  const now = new Date('2026-07-17T20:00:00.000Z');
  const evidence = buildValidEvidence(now);
  assert.equal(evidence.schemaVersion, 2);
  assert.equal(evidence.mfaState, 'ENABLED');
  assert.equal(evidence.mfaEnabled, true);
  assert.equal(evidence.testPhoneNumberCount, 0);
  assert.equal(evidence.commitSha, SHA);
  assert.equal(evidence.sensitiveValuesExcluded, true);
  assert.equal(evidence.hardLaunchClaim, false);
  assert.deepEqual(failures(evidence, now.getTime()), []);
  assert.doesNotMatch(JSON.stringify(evidence), /accessToken|phoneNumber|verificationCode|smsCode/);
});

test('Phone Auth evidence rejects MFA, test-number, and provenance tampering', () => {
  const now = new Date('2026-07-17T20:00:00.000Z');
  for (const [field, value, pattern] of [
    ['commitSha', 'b'.repeat(40), /commitSha/],
    ['mfaEnabled', false, /MFA enabled/],
    ['mfaState', 'DISABLED', /mfaState/],
    ['phoneProviderEnabled', false, /provider enabled/],
    ['requiredSmsRegionAllowed', false, /required SMS region allowed/],
    ['testPhoneNumberCount', 1, /production test phone number count/],
    ['verifiedAt', '2020-01-01T00:00:00.000Z', /stale/],
  ]) {
    const evidence = buildValidEvidence(now);
    evidence[field] = value;
    assert.match(failures(evidence, now.getTime()).join('\n'), pattern);
  }
});

test('production deploy checks and embeds Phone Auth before Firebase deployment verification', async () => {
  const deploy = await readFile(new URL('../../scripts/deploy-firebase-production.mjs', import.meta.url), 'utf8');
  const secretsCall = deploy.indexOf('await verifyFirebaseProductionSecrets');
  const phoneCall = deploy.indexOf('await verifyFirebasePhoneAuthProduction');
  const deployCall = deploy.indexOf("retryFirebase(\n  'functions,hosting,firestore:rules,firestore:indexes,storage'");
  const metadataCall = deploy.indexOf("'scripts/write-production-deployment-metadata.mjs'");
  const embedCall = deploy.indexOf('deploymentMetadata.firebasePhoneAuth = phoneAuthEvidence');
  const verifyCall = deploy.indexOf("'scripts/verify-production-deployment.mjs'");
  assert.ok(phoneCall > secretsCall);
  assert.ok(deployCall > phoneCall);
  assert.ok(metadataCall > deployCall);
  assert.ok(embedCall > metadataCall);
  assert.ok(verifyCall > embedCall);
});

test('deployment verifier requires nested Phone Auth evidence', async () => {
  const verifier = await readFile(new URL('../../scripts/verify-production-deployment.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /validateFirebasePhoneAuthEvidence/);
  assert.match(verifier, /existing\.firebasePhoneAuth/);
});

test('Phone Auth verifier uses Identity Toolkit, rejects test numbers, and emits aggregate evidence only', async () => {
  const verifier = await readFile(new URL('../../scripts/verify-firebase-phone-auth-production.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /identitytoolkit\.googleapis\.com\/admin\/v2\/projects/);
  assert.match(verifier, /config\?\.mfa\?\.state/);
  assert.match(verifier, /smsRegionConfig\?\.allowlistOnly\?\.allowedRegions/);
  assert.match(verifier, /testPhoneNumberCount !== 0/);
  assert.match(verifier, /test phone numbers must be removed before production launch/);
  assert.match(verifier, /requireExact\(evidence\.testPhoneNumberCount, 0/);
  assert.match(verifier, /sensitiveValuesExcluded: true/);
  assert.doesNotMatch(verifier, /console\.log\([^\n]*testPhoneNumbers/);
});

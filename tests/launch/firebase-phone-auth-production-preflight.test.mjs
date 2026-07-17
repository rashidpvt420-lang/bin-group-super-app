import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateFirebasePhoneAuthConfig } from '../../scripts/verify-firebase-phone-auth-production.mjs';

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

test('protected production deploy runs Phone Auth preflight before the first Firebase deploy attempt', async () => {
  const deploy = await readFile(new URL('../../scripts/deploy-firebase-production.mjs', import.meta.url), 'utf8');
  const secretsImport = deploy.indexOf("verifyFirebaseProductionSecrets");
  const phoneImport = deploy.indexOf("verifyFirebasePhoneAuthProduction");
  const secretsCall = deploy.indexOf('await verifyFirebaseProductionSecrets');
  const phoneCall = deploy.indexOf('await verifyFirebasePhoneAuthProduction');
  const deployCall = deploy.indexOf("retryFirebase(\n  'functions,hosting,firestore:rules,firestore:indexes,storage'");

  assert.ok(secretsImport >= 0, 'production secret preflight import must remain present');
  assert.ok(phoneImport > secretsImport, 'Phone Auth preflight import must be explicit');
  assert.ok(secretsCall >= 0, 'production secret preflight must execute');
  assert.ok(phoneCall > secretsCall, 'Phone Auth config must be checked after authenticated secret metadata');
  assert.ok(deployCall > phoneCall, 'Phone Auth config must be checked before any Firebase deploy attempt');
  assert.match(deploy, /Firebase Phone Auth production preflight failed/);
});

test('Phone Auth verifier uses Identity Toolkit config API and emits only aggregate configuration evidence', async () => {
  const verifier = await readFile(new URL('../../scripts/verify-firebase-phone-auth-production.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /identitytoolkit\.googleapis\.com\/admin\/v2\/projects/);
  assert.match(verifier, /credential\.getAccessToken\(\)/);
  assert.match(verifier, /signIn\?\.phoneNumber\?\.enabled/);
  assert.match(verifier, /authorizedDomains/);
  assert.match(verifier, /smsRegionConfig\?\.allowlistOnly\?\.allowedRegions/);
  assert.match(verifier, /testPhoneNumberCount/);
  assert.doesNotMatch(verifier, /console\.log\([^\n]*testPhoneNumbers/);
});

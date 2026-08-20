import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFounderTotpSignIn } from '../../scripts/verify-founder-totp-signin.mjs';

function environment(overrides = {}) {
  return {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
    GITHUB_WORKFLOW: 'Firebase Production Deploy',
    GITHUB_JOB: 'deploy-firebase-production-stack',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: '0'.repeat(40),
    DEPLOYMENT_ENVIRONMENT: 'production',
    GCP_PROJECT_ID: 'bin-group-57c60',
    VITE_FIREBASE_API_KEY: 'test-api-key',
    E2E_FOUNDER_EMAIL: 'ceo@bin-groups.com',
    E2E_FOUNDER_PASSWORD: 'protected-password',
    E2E_FOUNDER_TOTP_SECRET: 'JBSWY3DPEHPK3PXP',
    ...overrides,
  };
}

test('Founder TOTP sign-in preflight uses only the canonical protected deployment context', async () => {
  let received;
  const evidence = await verifyFounderTotpSignIn({
    env: environment(),
    signInImpl: async (input) => {
      received = input;
      return { secondFactorType: 'totp', secondFactorIdentifier: 'enrolled-factor-id' };
    },
  });

  assert.equal(received.email, 'ceo@bin-groups.com');
  assert.equal(received.referer, 'https://bin-group-admin-panel.web.app/');
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.verifiedSecondFactor, 'totp');
  assert.equal(evidence.credentialResynchronized, false);
  assert.equal(evidence.sensitiveValuesExcluded, true);
  assert.doesNotMatch(JSON.stringify(evidence), /protected-password|JBSWY3DPEHPK3PXP/);
});

test('Founder TOTP preflight repairs protected credential drift, then still requires real TOTP success', async () => {
  let signInCalls = 0;
  let syncCalls = 0;
  const evidence = await verifyFounderTotpSignIn({
    env: environment(),
    signInImpl: async () => {
      signInCalls += 1;
      if (signInCalls === 1) throw new Error('Firebase first-factor sign-in failed: INVALID_LOGIN_CREDENTIALS');
      return { secondFactorType: 'totp', secondFactorIdentifier: 'factor-after-sync' };
    },
    synchronizePasswordImpl: async ({ email, password }) => {
      syncCalls += 1;
      assert.equal(email, 'ceo@bin-groups.com');
      assert.equal(password, 'protected-password');
      return { founderUid: 'canonical-founder-uid', enrolledMfaFactorCount: 1 };
    },
  });

  assert.equal(syncCalls, 1);
  assert.equal(signInCalls, 2);
  assert.equal(evidence.credentialResynchronized, true);
  assert.equal(evidence.verifiedSecondFactor, 'totp');
});

test('Founder TOTP preflight never mutates credentials for non-password failures', async () => {
  let syncCalls = 0;
  await assert.rejects(
    verifyFounderTotpSignIn({
      env: environment(),
      signInImpl: async () => { throw new Error('Firebase TOTP sign-in failed: INVALID_VERIFICATION_CODE'); },
      synchronizePasswordImpl: async () => { syncCalls += 1; },
    }),
    /INVALID_VERIFICATION_CODE/,
  );
  assert.equal(syncCalls, 0);
});

test('Founder TOTP sign-in preflight rejects a non-production or non-canonical context', async () => {
  await assert.rejects(
    verifyFounderTotpSignIn({ env: environment({ GITHUB_REF: 'refs/heads/feature' }) }),
    /refs\/heads\/main/,
  );
  await assert.rejects(
    verifyFounderTotpSignIn({ env: environment({ E2E_FOUNDER_EMAIL: 'other@example.com' }) }),
    /ceo@bin-groups\.com/,
  );
});

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
    DEPLOYMENT_ENVIRONMENT: 'production',
    GCP_PROJECT_ID: 'bin-group-57c60',
    VITE_FIREBASE_API_KEY: 'test-api-key',
    E2E_FOUNDER_EMAIL: 'ceo@bin-groups.com',
    E2E_FOUNDER_PASSWORD: 'protected-password',
    E2E_FOUNDER_TOTP_SECRET: 'JBSWY3DPEHPK3PXP',
    ...overrides,
  };
}

function founder(overrides = {}) {
  return {
    uid: 'founder-uid',
    email: 'ceo@bin-groups.com',
    disabled: false,
    emailVerified: true,
    customClaims: { role: 'ceo', admin: true },
    multiFactor: {
      enrolledFactors: [{ factorId: 'totp', uid: 'totp-factor' }],
    },
    ...overrides,
  };
}

function authClient(user = founder()) {
  const updates = [];
  return {
    updates,
    getUserByEmail: async () => user,
    updateUser: async (uid, patch) => {
      updates.push({ uid, patch });
      return user;
    },
  };
}

test('Founder TOTP sign-in preflight uses only the canonical protected deployment context', async () => {
  let received;
  const auth = authClient();
  const evidence = await verifyFounderTotpSignIn({
    env: environment(),
    authClient: auth,
    signInImpl: async (input) => {
      received = input;
      return { secondFactorType: 'totp', secondFactorIdentifier: 'enrolled-factor-id' };
    },
  });

  assert.equal(received.email, 'ceo@bin-groups.com');
  assert.equal(received.referer, 'https://bin-group-admin-panel.web.app/');
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.verifiedSecondFactor, 'totp');
  assert.equal(evidence.passwordSynchronized, false);
  assert.equal(evidence.roleAndMfaStateChanged, false);
  assert.equal(evidence.sensitiveValuesExcluded, true);
  assert.equal(auth.updates.length, 0);
  assert.doesNotMatch(JSON.stringify(evidence), /protected-password|JBSWY3DPEHPK3PXP/);
});

test('Founder TOTP preflight synchronizes only the canonical Founder password after an invalid first factor and then requires TOTP success', async () => {
  const auth = authClient();
  let attempts = 0;
  const evidence = await verifyFounderTotpSignIn({
    env: environment(),
    authClient: auth,
    signInImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Firebase first-factor sign-in failed: INVALID_LOGIN_CREDENTIALS');
      return { secondFactorType: 'totp', secondFactorIdentifier: 'totp-factor' };
    },
  });

  assert.equal(attempts, 2);
  assert.deepEqual(auth.updates, [{ uid: 'founder-uid', patch: { password: 'protected-password' } }]);
  assert.equal(evidence.passwordSynchronized, true);
  assert.equal(evidence.verifiedSecondFactor, 'totp');
  assert.equal(evidence.roleAndMfaStateChanged, false);
});

test('Founder TOTP preflight refuses credential mutation unless the canonical Founder is verified, privileged and TOTP-enrolled', async () => {
  const auth = authClient(founder({
    customClaims: { role: 'owner' },
    multiFactor: { enrolledFactors: [] },
  }));

  await assert.rejects(
    verifyFounderTotpSignIn({
      env: environment(),
      authClient: auth,
      signInImpl: async () => {
        throw new Error('Firebase first-factor sign-in failed: INVALID_LOGIN_CREDENTIALS');
      },
    }),
    /active, verified, CEO\/Super Admin privileged, and TOTP-enrolled/,
  );
  assert.equal(auth.updates.length, 0);
});

test('Founder TOTP sign-in preflight rejects a non-production or non-canonical context', async () => {
  await assert.rejects(
    verifyFounderTotpSignIn({ env: environment({ GITHUB_REF: 'refs/heads/feature' }), authClient: authClient() }),
    /refs\/heads\/main/,
  );
  await assert.rejects(
    verifyFounderTotpSignIn({ env: environment({ E2E_FOUNDER_EMAIL: 'other@example.com' }), authClient: authClient() }),
    /ceo@bin-groups\.com/,
  );
});

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
  assert.equal(evidence.sensitiveValuesExcluded, true);
  assert.doesNotMatch(JSON.stringify(evidence), /protected-password|JBSWY3DPEHPK3PXP/);
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

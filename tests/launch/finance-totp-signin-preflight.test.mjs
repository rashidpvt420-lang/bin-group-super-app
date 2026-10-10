import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyFinanceApproverTotpSignIn } from '../../scripts/verify-finance-approver-totp-signin.mjs';

const repo = 'rashidpvt420-lang/bin-group-super-app';
const sha = 'a'.repeat(40);
const env = {
  GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: repo, GITHUB_WORKFLOW: 'Firebase Production Deploy',
  GITHUB_JOB: 'deploy-firebase-production-stack', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha, GITHUB_RUN_ID: '123',
  DEPLOYMENT_ENVIRONMENT: 'production', GCP_PROJECT_ID: 'bin-group-57c60',
  E2E_FINANCE_APPROVER_EMAIL: 'finance@example.invalid', E2E_FINANCE_APPROVER_PASSWORD: 'fixture-password',
  E2E_FINANCE_APPROVER_TOTP_SECRET: 'fixture-totp', VITE_FIREBASE_API_KEY: 'fixture-key',
};
const finance = { uid: 'finance', email: env.E2E_FINANCE_APPROVER_EMAIL, emailVerified: true,
  customClaims: { role: 'finance_admin' }, multiFactor: { enrolledFactors: [{ factorId: 'totp', uid: 'factor' }] } };
const session = { uid: 'finance', secondFactorType: 'totp', secondFactorIdentifier: 'factor' };
function fixture(t, { overrides = {}, user = finance, signInImpl = async () => session, deploymentOverrides = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'finance-preflight-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'launch_package'));
  writeFileSync(path.join(root, 'launch_package/hard-launch-authorization.json'), JSON.stringify({
    approved: true, commitSha: sha, repository: repo, runId: '123', founder: { email: 'ceo@bin-groups.com' },
  }));
  writeFileSync(path.join(root, 'launch_package/production-deployment.json'), JSON.stringify({
    status: 'passed', projectId: 'bin-group-57c60', deployedCommitSha: sha, repository: repo,
    workflowRunId: '123', ...deploymentOverrides,
  }));
  const mutations = [];
  return { mutations, options: { env: { ...env, ...overrides }, root, signInImpl,
    authClient: { getUserByEmail: async (email) => email === 'ceo@bin-groups.com' ? { uid: 'founder' } : user,
      updateUser: async (...args) => mutations.push(args) } } };
}

test('Finance preflight verifies TOTP without mutating an accepted password', async (t) => {
  const f = fixture(t);
  assert.equal((await verifyFinanceApproverTotpSignIn(f.options)).passwordSynchronized, false);
  assert.deepEqual(f.mutations, []);
});
test('Only an explicit first-factor mismatch synchronizes the existing Finance password, then requires TOTP', async (t) => {
  let calls = 0;
  const f = fixture(t, { signInImpl: async () => {
    if (++calls === 1) throw new Error('Finance Admin first-factor sign-in failed (HTTP 400): INVALID_LOGIN_CREDENTIALS.');
    return session;
  } });
  assert.equal((await verifyFinanceApproverTotpSignIn(f.options)).passwordSynchronized, true);
  assert.deepEqual(f.mutations, [['finance', { password: env.E2E_FINANCE_APPROVER_PASSWORD }]]);
  assert.equal(calls, 2);
});
test('TOTP, API, disabled-user and unknown failures never trigger password changes', async (t) => {
  for (const message of ['Finance Admin TOTP sign-in failed: INVALID_VERIFICATION_CODE.',
    'Finance Admin first-factor sign-in failed (HTTP 400): USER_DISABLED.',
    'Finance Admin first-factor sign-in failed (HTTP 403): API_KEY_HTTP_REFERRER_BLOCKED.',
    'Finance Admin first-factor sign-in failed (HTTP 400): UNKNOWN_PROVIDER_ERROR.']) {
    const f = fixture(t, { signInImpl: async () => { throw new Error(message); } });
    await assert.rejects(verifyFinanceApproverTotpSignIn(f.options));
    assert.deepEqual(f.mutations, []);
  }
});
test('Wrong context, stale artifacts, role collisions and unready identities fail before sign-in or mutation', async (t) => {
  for (const config of [
    { overrides: { GITHUB_REF: 'refs/heads/feature' } },
    { deploymentOverrides: { workflowRunId: '122' } },
    { overrides: { E2E_ADMIN_EMAIL: env.E2E_FINANCE_APPROVER_EMAIL } },
    { user: { ...finance, uid: 'founder' } }, { user: { ...finance, disabled: true } },
    { user: { ...finance, emailVerified: false } },
    { user: { ...finance, customClaims: { role: 'admin' } } },
    { user: { ...finance, multiFactor: { enrolledFactors: [] } } },
  ]) {
    let calls = 0;
    const f = fixture(t, { ...config, signInImpl: async () => { calls++; return session; } });
    await assert.rejects(verifyFinanceApproverTotpSignIn(f.options));
    assert.equal(calls, 0); assert.deepEqual(f.mutations, []);
  }
});
test('Mismatched UID/factor and failed second sign-in cannot pass', async (t) => {
  for (const invalidSession of [{ ...session, uid: 'other' }, { ...session, secondFactorIdentifier: 'other' },
    { ...session, secondFactorType: 'phone' }]) {
    const f = fixture(t, { signInImpl: async () => invalidSession });
    await assert.rejects(verifyFinanceApproverTotpSignIn(f.options), /existing UID/);
  }
});
test('Broker evidence uses the budget input identity provided by the actual form', () => {
  const form = readFileSync('src/broker/pages/BrokerLeadsPage.tsx', 'utf8');
  const suite = readFileSync('tests/e2e/business-broker.spec.ts', 'utf8');
  assert.match(form, /'data-testid': 'broker-lead-budget'/);
  assert.match(suite, /getByTestId\('broker-lead-budget'\)\.fill\('50000'\)/);
  assert.doesNotMatch(suite, /Budget Range/);
});

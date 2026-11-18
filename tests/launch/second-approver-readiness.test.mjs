// Named second approver (Rashid, 18 Nov 2026): readiness, the deploy cleanup check and owner cleanup
// accept a third privileged account ONLY when it is exactly the SECOND_APPROVER_EMAIL Super Admin with
// the designatedSecondApprover claim, a verified email, MFA and an active profile. Otherwise they stay
// exactly as strict as the Founder + Finance Admin pair. It is never a Finance money approver.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isConfiguredSecondApprover,
  secondApproverConfigFailures,
  summarizeAdminMfaUsers,
  buildAdminMfaEvidence,
  validateAdminMfaEvidence,
} from '../../scripts/verify-admin-mfa-production.mjs';
import { summarizePrivilegedAccountReview } from '../../scripts/review-privileged-accounts-production.mjs';
import {
  planSecondApproverBootstrap,
  requireSecondApproverExecutionContext,
  secondApproverClaims,
  SECOND_APPROVER_CONFIRMATION,
  SECOND_APPROVER_WORKFLOW_NAME,
} from '../../scripts/bootstrap-second-approver-production.mjs';
import { protectedEvidenceIdentityReason } from '../../scripts/lib/evidence-identity-guard.mjs';
import { validateEphemeralE2eAdminIdentity } from '../../scripts/e2e-admin-lifecycle.mjs';

const FINANCE_EMAIL = 'finance@bin-groups.com';
const SECOND_EMAIL = 'second@bin-groups.com';
const active = { profileExists: true, profile: { status: 'active' }, disabled: false, emailVerified: true };
const founder = () => ({ uid: 'f', email: 'ceo@bin-groups.com', customClaims: { role: 'ceo', ceo: true }, multiFactor: { enrolledFactors: [{ factorId: 'phone' }] }, ...active });
const finance = () => ({ uid: 'fa', email: FINANCE_EMAIL, customClaims: { role: 'finance_admin', finance_admin: true }, multiFactor: { enrolledFactors: [{ factorId: 'totp' }] }, ...active });
const second = (overrides = {}, claims = {}) => ({
  uid: 's2', email: SECOND_EMAIL, customClaims: { ...secondApproverClaims(), ...claims },
  multiFactor: { enrolledFactors: [{ factorId: 'phone' }] }, ...active, ...overrides,
});
const summarize = (users, secondApproverEmail = SECOND_EMAIL) =>
  summarizeAdminMfaUsers(users, { expectedFinanceEmail: FINANCE_EMAIL, secondApproverEmail });

test('without a second approver the Founder + Finance Admin pair is unchanged', () => {
  for (const email of ['', SECOND_EMAIL]) {
    const result = summarize([founder(), finance()], email);
    assert.equal(result.ok, true, result.failures.join('; '));
    assert.equal(result.summary.claimedAdminCount, 2);
    assert.equal(result.summary.expectedPrivilegedAccountCount, 2);
    assert.equal(result.summary.secondApproverCandidateCount, 0);
  }
});

test('the exact named, MFA-ready second approver is accepted as the third privileged account', () => {
  for (const factorId of ['phone', 'totp']) {
    const result = summarize([founder(), finance(), second({ multiFactor: { enrolledFactors: [{ factorId }] } })]);
    assert.equal(result.ok, true, result.failures.join('; '));
    assert.equal(result.summary.claimedAdminCount, 3);
    assert.equal(result.summary.expectedPrivilegedAccountCount, 3);
    assert.equal(result.summary.secondApproverMfaReadyCount, 1);
    assert.equal(result.summary.unexpectedPrivilegedAccountCount, 0);
    const evidence = buildAdminMfaEvidence(result.summary, { env: { GITHUB_SHA: 'a'.repeat(40) }, now: new Date() });
    assert.deepEqual(validateAdminMfaEvidence(evidence, { commitSha: 'a'.repeat(40), now: Date.now() }), []);
  }
});

test('a present but not MFA-ready second approver is never accepted', () => {
  const cases = [
    second({ multiFactor: { enrolledFactors: [] } }),
    second({ emailVerified: false }),
    second({ disabled: true }),
    second({ profileExists: false, profile: {} }),
    second({ profile: { status: 'suspended' } }),
  ];
  for (const candidate of cases) {
    const result = summarize([founder(), finance(), candidate]);
    assert.equal(result.ok, false);
    assert.equal(result.summary.dualControlReady, false);
  }
});

test('any other third privileged account stays unexpected, exactly as before', () => {
  const cases = [
    [second(), ''], // secret unset
    [second({ email: 'other@bin-groups.com' }), SECOND_EMAIL], // wrong identity
    [second({}, { designatedSecondApprover: false }), SECOND_EMAIL], // claim missing
    [second({}, { role: 'ceo', userRole: 'ceo', primaryRole: 'ceo', ceo: true }), SECOND_EMAIL], // second CEO
    [second({}, { finance_admin: true }), SECOND_EMAIL], // money authority
    [second({}, { finance_controller: true }), SECOND_EMAIL],
    [second({}, { financeAuthorizedAt: Date.now() }), SECOND_EMAIL],
    [second({}, { staff: true }), SECOND_EMAIL],
    [second({}, { role: 'admin', userRole: 'admin', primaryRole: 'admin' }), SECOND_EMAIL],
  ];
  for (const [candidate, email] of cases) {
    const result = summarize([founder(), finance(), candidate], email);
    assert.equal(result.ok, false, JSON.stringify(candidate.customClaims));
    assert.equal(result.summary.unexpectedPrivilegedAccountCount, 1);
  }
  // A fourth privileged account is still refused even with a ready second approver.
  const extra = { uid: 'x', email: 'x@bin-groups.com', customClaims: { role: 'admin', admin: true }, ...active };
  assert.equal(summarize([founder(), finance(), second(), extra]).ok, false);
});

test('a misconfigured SECOND_APPROVER_EMAIL fails closed', () => {
  assert.ok(secondApproverConfigFailures('ceo@bin-groups.com').length > 0);
  assert.ok(secondApproverConfigFailures(FINANCE_EMAIL, { expectedFinanceEmail: FINANCE_EMAIL }).length > 0);
  assert.ok(secondApproverConfigFailures('not-an-email').length > 0);
  assert.equal(isConfiguredSecondApprover(second({ email: 'ceo@bin-groups.com' }), { secondApproverEmail: 'ceo@bin-groups.com' }), false);
  assert.equal(summarize([founder(), finance()], FINANCE_EMAIL).ok, false);
});

test('evidence validation requires the second approver to be counted, ready and named', () => {
  const ok = summarize([founder(), finance(), second()]);
  const evidence = buildAdminMfaEvidence(ok.summary, { env: { GITHUB_SHA: 'b'.repeat(40) }, now: new Date() });
  const check = (patch) => validateAdminMfaEvidence({ ...evidence, ...patch }, { commitSha: 'b'.repeat(40), now: Date.now() });
  assert.ok(check({ secondApproverMfaReadyCount: 0 }).length > 0);
  assert.ok(check({ secondApproverConfigured: false }).length > 0);
  assert.ok(check({ secondApproverCandidateCount: 2, secondApproverMfaReadyCount: 2 }).length > 0);
  assert.ok(check({ claimedAdminCount: 2 }).length > 0);
  // Legacy evidence without the new fields is read as exactly two accounts.
  const { secondApproverCandidateCount, secondApproverMfaReadyCount, expectedPrivilegedAccountCount, ...legacy } = evidence;
  assert.ok(validateAdminMfaEvidence(legacy, { commitSha: 'b'.repeat(40), now: Date.now() }).length > 0);
});

test('cleanup review retains only the MFA-ready named second approver', () => {
  const review = (users, email = SECOND_EMAIL) => summarizePrivilegedAccountReview(users, { expectedFinanceEmail: FINANCE_EMAIL, secondApproverEmail: email });
  const ready = review([founder(), finance(), second()]);
  assert.equal(ready.deletionTargetCount, 0);
  assert.equal(ready.secondApproverRetainedCount, 1);
  assert.equal(review([founder(), finance(), second({ multiFactor: { enrolledFactors: [] } })]).deletionTargetCount, 1);
  assert.equal(review([founder(), finance(), second()], '').deletionTargetCount, 1);
  assert.equal(review([founder(), finance(), second({}, { finance_admin: true })]).deletionTargetCount, 1);
  assert.ok(review([founder(), finance()], 'ceo@bin-groups.com').executionBlockers.length > 0);
});

test('the deploy cleanup and owner cleanup source retain only a ready second approver', () => {
  const source = readFileSync('scripts/delete-obsolete-privileged-accounts-production.mjs', 'utf8');
  assert.match(source, /isConfiguredSecondApprover\(user, \{ secondApproverEmail, expectedFinanceEmail \}\) &&\s*secondApproverMfaReady\(user\)/);
  assert.match(source, /user\.uid !== retainedSecondApproverUid/);
  assert.match(source, /the MFA-ready named second approver is never a privileged-cleanup target/);
  assert.match(source, /Cleanup refused: \$\{secondApproverMisconfiguration/);
  assert.match(source, /No unexpected privileged identity was modified/);
});

const ctxEnv = (patch = {}) => ({
  GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: SECOND_APPROVER_WORKFLOW_NAME, GITHUB_REF: 'refs/heads/main',
  DEPLOYMENT_ENVIRONMENT: 'production', GITHUB_SHA: 'c'.repeat(40),
  SECOND_APPROVER_BOOTSTRAP_CONFIRMATION: SECOND_APPROVER_CONFIRMATION,
  CANONICAL_FOUNDER_EMAIL_CONFIRMATION: 'ceo@bin-groups.com',
  SECOND_APPROVER_EMAIL: SECOND_EMAIL, SECOND_APPROVER_EMAIL_CONFIRMATION: SECOND_EMAIL,
  E2E_FINANCE_APPROVER_EMAIL: FINANCE_EMAIL, ...patch,
});

test('the bootstrap runs only from the owner-confirmed protected workflow context', () => {
  assert.deepEqual(requireSecondApproverExecutionContext({ projectId: 'bin-group-57c60', env: ctxEnv() }).email, SECOND_EMAIL);
  for (const patch of [
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_WORKFLOW: 'Firebase Production Deploy' },
    { GITHUB_REF: 'refs/heads/feature' },
    { DEPLOYMENT_ENVIRONMENT: 'staging' },
    { SECOND_APPROVER_BOOTSTRAP_CONFIRMATION: 'yes' },
    { CANONICAL_FOUNDER_EMAIL_CONFIRMATION: 'x@bin-groups.com' },
    { SECOND_APPROVER_EMAIL_CONFIRMATION: 'typo@bin-groups.com' },
    { SECOND_APPROVER_EMAIL: '' },
    { SECOND_APPROVER_EMAIL: 'ceo@bin-groups.com', SECOND_APPROVER_EMAIL_CONFIRMATION: 'ceo@bin-groups.com' },
    { SECOND_APPROVER_EMAIL: FINANCE_EMAIL, SECOND_APPROVER_EMAIL_CONFIRMATION: FINANCE_EMAIL },
    { E2E_ADMIN_EMAIL: SECOND_EMAIL },
    { E2E_FINANCE_APPROVER_EMAIL: '' },
  ]) {
    assert.throws(() => requireSecondApproverExecutionContext({ projectId: 'bin-group-57c60', env: ctxEnv(patch) }), undefined, JSON.stringify(patch));
  }
  assert.throws(() => requireSecondApproverExecutionContext({ projectId: 'other', env: ctxEnv() }));
});

test('the bootstrap creates or promotes exactly one eligible identity, once', () => {
  const base = [founder(), finance()];
  assert.equal(planSecondApproverBootstrap({ users: base, email: SECOND_EMAIL }).mode, 'create');
  const staff = { uid: 's2', email: SECOND_EMAIL, customClaims: { role: 'hr_admin' }, ...active };
  assert.equal(planSecondApproverBootstrap({ users: [...base, staff], email: SECOND_EMAIL, targetProfile: { role: 'hr_admin' } }).mode, 'promote');
  assert.equal(planSecondApproverBootstrap({ users: [...base, second()], email: SECOND_EMAIL, targetProfile: { role: 'super_admin' } }).mode, 'already-provisioned');

  const refuse = (users, extra = {}) => assert.throws(() => planSecondApproverBootstrap({ users, email: SECOND_EMAIL, ...extra }));
  refuse([finance()]); // no Founder
  refuse([{ ...founder(), multiFactor: { enrolledFactors: [] } }, finance()]); // Founder without phone MFA
  refuse([...base, { ...staff, customClaims: { role: 'finance_controller', finance_controller: true } }]);
  refuse([...base, { ...staff, customClaims: { role: 'finance_manager' } }]);
  refuse([...base, { ...staff, customClaims: { role: 'payroll_admin' } }]);
  refuse([...base, { ...staff, customClaims: { role: 'ceo', ceo: true } }]);
  refuse([...base, { ...staff, customClaims: { role: 'owner' } }], { targetProfile: { role: 'owner' } });
  refuse([...base, { ...staff, customClaims: { role: 'technician', technician: true } }]);
  refuse([...base, { ...staff, customClaims: { role: 'admin', testAccount: true } }]);
  refuse([...base, { ...staff, disabled: true }]);
  refuse([...base, staff], { targetProfile: { role: 'tenant' } });
  // Another account already designated, or the one-time marker bound to a different identity.
  refuse([...base, second({ email: 'other@bin-groups.com', uid: 'o' })]);
  refuse(base, { marker: { consumed: true, targetEmailHash: 'f'.repeat(64) } });
});

test('the bootstrap claim set is Super Admin with no Finance, CEO or staff authority', () => {
  const claims = secondApproverClaims();
  assert.equal(claims.role, 'super_admin');
  assert.equal(claims.super_admin, true);
  assert.equal(claims.designatedSecondApprover, true);
  for (const flag of ['ceo', 'staff', 'isStaff', 'finance_admin', 'finance_manager', 'finance_controller', 'suspended']) {
    assert.equal(claims[flag], false, flag);
  }
  assert.equal('financeAuthorizedAt' in claims, false);
  assert.equal('modules' in claims, false);
  assert.equal(isConfiguredSecondApprover({ email: SECOND_EMAIL, customClaims: claims }, { secondApproverEmail: SECOND_EMAIL }), true);
});

test('evidence identity guards and the E2E Admin lifecycle never touch the second approver', () => {
  assert.ok(protectedEvidenceIdentityReason({ email: SECOND_EMAIL, customClaims: {} }, { SECOND_APPROVER_EMAIL: SECOND_EMAIL }));
  assert.ok(protectedEvidenceIdentityReason({ email: 'x@bin-groups.com', customClaims: { designatedSecondApprover: true } }, {}));
  assert.throws(
    () => validateEphemeralE2eAdminIdentity({
      authUser: { uid: 's2', email: SECOND_EMAIL, customClaims: { ...secondApproverClaims(), testAccount: true } },
      profile: { uid: 's2', email: SECOND_EMAIL, testAccount: true, role: 'admin' },
      configuredEmail: SECOND_EMAIL,
    }),
    /second approver/,
  );
});

test('the bootstrap workflow is owner-only, production-protected, exact-main and dry-runs first', () => {
  const workflow = readFileSync('.github/workflows/second-approver-bootstrap-production.yml', 'utf8');
  assert.match(workflow, /name: Second Approver Bootstrap - Production/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule|workflow_run):/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /\[\[ "\$GITHUB_ACTOR" == "\$REPOSITORY_OWNER" \]\]/);
  assert.match(workflow, /\[\[ "\$CONFIRMATION" == "PROVISION_NAMED_SECOND_APPROVER_BIN_GROUP" \]\]/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
  assert.match(workflow, /SECOND_APPROVER_EMAIL: \$\{\{ secrets\.SECOND_APPROVER_EMAIL \}\}/);
  assert.match(workflow, /SECOND_APPROVER_EMAIL_CONFIRMATION: \$\{\{ inputs\.second_approver_email_confirmation \}\}/);
  const plan = workflow.indexOf('node scripts/bootstrap-second-approver-production.mjs\n');
  const execute = workflow.indexOf('node scripts/bootstrap-second-approver-production.mjs --execute');
  assert.ok(plan > 0 && execute > plan);
  assert.match(workflow, /if: \$\{\{ inputs\.execute_bootstrap \}\}/);
  assert.doesNotMatch(workflow, /firebase\s+deploy/i);
  assert.doesNotMatch(workflow, /echo[^\n]*SECOND_APPROVER_EMAIL/);
  const script = readFileSync('scripts/bootstrap-second-approver-production.mjs', 'utf8');
  assert.match(script, /NAMED_SECOND_APPROVER_PROVISIONED/);
  assert.match(script, /system_secrets/);
  assert.doesNotMatch(script, /generatePasswordResetLink|generateEmailVerificationLink|password:/);
  assert.doesNotMatch(script, /console\.log\([^)]*(email|uid)\b/);
});

test('every readiness, cleanup and deploy workflow receives the protected SECOND_APPROVER_EMAIL', () => {
  for (const file of [
    'firebase-production-deploy', 'production-readiness-preflight', 'privileged-account-cleanup-production',
    'privileged-account-cleanup-dry-run', 'privileged-account-review-request', 'live-launch-audit', 'live-role-smoke',
  ]) {
    const source = readFileSync(`.github/workflows/${file}.yml`, 'utf8');
    assert.match(source, /SECOND_APPROVER_EMAIL: \$\{\{ secrets\.SECOND_APPROVER_EMAIL \}\}/, file);
  }
  const deploy = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
  const cleanupStep = deploy.slice(deploy.indexOf('Remove unexpected privileged Firebase accounts'), deploy.indexOf('Deploy and verify Firebase production stack'));
  assert.match(cleanupStep, /SECOND_APPROVER_EMAIL: \$\{\{ secrets\.SECOND_APPROVER_EMAIL \}\}/);
});

test('money approval paths refuse the second approver claim', () => {
  const financeMfa = readFileSync('functions/financeAdminMfa.ts', 'utf8');
  assert.match(financeMfa, /if \(claims\.designatedSecondApprover === true\) return false;/);
  const painting = readFileSync('functions/paintingFinanceApprover.ts', 'utf8');
  assert.equal((painting.match(/designatedSecondApprover === true/g) || []).length, 2);
  const rules = readFileSync('firestore.rules', 'utf8');
  const fn = rules.slice(rules.indexOf('function isFinanceApprover()'), rules.indexOf('function isOps()'));
  assert.match(fn, /designatedSecondApprover', false\) != true/);
});

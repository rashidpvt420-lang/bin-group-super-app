import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CANONICAL_FOUNDER_EMAIL,
  FINANCE_TIER_APPROVER_ROLES,
  claimsGrantAdminPortal,
  isExplicitFinanceTierApprover,
  summarizeAdminMfaUsers,
} from '../../scripts/verify-admin-mfa-production.mjs';
import { summarizePrivilegedAccountReview } from '../../scripts/review-privileged-accounts-production.mjs';
import {
  assertResettableEvidenceIdentity,
  protectedEvidenceIdentityReason,
} from '../../scripts/lib/evidence-identity-guard.mjs';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const phone = { uid: 'f-phone', factorId: 'phone' };
const totp = { uid: 'f-totp', factorId: 'totp' };
const FINANCE_ADMIN_EMAIL = 'finance.admin@example.invalid';

const account = (uid, email, customClaims, factors, extra = {}) => ({
  uid,
  email,
  customClaims,
  disabled: false,
  emailVerified: true,
  profileExists: true,
  profile: { status: 'active' },
  multiFactor: { enrolledFactors: factors },
  ...extra,
});
// Claims exactly as adminApproveFinanceRoleAssignment / claimsForAccess writes them.
const tierClaims = (role, overrides = {}) => ({
  role,
  userRole: role,
  primaryRole: role,
  staff: true,
  isStaff: true,
  finance_admin: false,
  finance_manager: role === 'finance_manager',
  finance_controller: role === 'finance_controller',
  admin: false,
  isAdmin: false,
  superAdmin: false,
  super_admin: false,
  ceo: false,
  modules: [],
  financeAuthorizedAt: 1,
  ...overrides,
});
const founder = () => account('founder', CANONICAL_FOUNDER_EMAIL, { role: 'ceo', ceo: true }, [phone]);
const financeAdmin = () => account('fa', FINANCE_ADMIN_EMAIL, { role: 'finance_admin', finance_admin: true }, [totp]);

test('explicit finance_manager / finance_controller accounts are recognized as Finance tier approvers', () => {
  assert.deepEqual([...FINANCE_TIER_APPROVER_ROLES].sort(), ['finance_controller', 'finance_manager']);
  for (const role of ['finance_manager', 'finance_controller']) {
    const user = account(role, `${role}@example.invalid`, tierClaims(role), [totp]);
    assert.equal(isExplicitFinanceTierApprover(user), true, role);
    assert.equal(claimsGrantAdminPortal(user.customClaims), false, `${role} holds no Admin-portal authority`);
  }
});

test('anything elevated, ambiguous or unknown is NOT treated as a Finance tier approver', () => {
  const email = 'x@example.invalid';
  for (const [label, claims] of [
    ['admin flag', tierClaims('finance_manager', { admin: true })],
    ['isAdmin flag', tierClaims('finance_manager', { isAdmin: true })],
    ['super admin flag', tierClaims('finance_controller', { superAdmin: true })],
    ['ceo flag', tierClaims('finance_controller', { ceo: true })],
    ['manager flag', tierClaims('finance_manager', { manager: true })],
    ['finance_admin flag', tierClaims('finance_manager', { finance_admin: true })],
    ['both tier flags', tierClaims('finance_manager', { finance_controller: true })],
    ['missing explicit role flag', tierClaims('finance_manager', { finance_manager: false })],
    ['conflicting role fields', tierClaims('finance_manager', { userRole: 'admin' })],
    ['finance_admin role', { role: 'finance_admin', finance_admin: true }],
    ['finance_staff role', { role: 'finance_staff' }],
    ['payroll_admin role', { role: 'payroll_admin' }],
    ['no role', {}],
  ]) {
    assert.equal(isExplicitFinanceTierApprover(account('u', email, claims, [totp])), false, label);
  }
  assert.equal(
    isExplicitFinanceTierApprover(account('u', CANONICAL_FOUNDER_EMAIL, tierClaims('finance_manager'), [totp])),
    false,
    'the canonical Founder email can never be a tier approver',
  );
});

test('production MFA readiness stays Founder + one Finance Admin and accepts a Finance tier approver', () => {
  const recorder = account('rec', 'recorder@example.invalid', tierClaims('finance_manager'), [totp]);
  const result = summarizeAdminMfaUsers([founder(), financeAdmin(), recorder], { expectedFinanceEmail: FINANCE_ADMIN_EMAIL });
  assert.equal(result.ok, true, result.failures.join('; '));
  assert.equal(result.summary.claimedAdminCount, 2);
  assert.equal(result.summary.unexpectedPrivilegedAccountCount, 0);
  assert.equal(result.summary.financeApproverCandidateCount, 1);
  assert.equal(result.summary.financeTierApproverCount, 1);
  assert.equal(result.summary.financeTierApproverTotpReadyCount, 1);
  assert.equal(result.summary.dualControlReady, true);

  // Before TOTP enrollment the tier approver is reported but never blocks or becomes unexpected.
  const notEnrolled = summarizeAdminMfaUsers(
    [founder(), financeAdmin(), account('rec', 'recorder@example.invalid', tierClaims('finance_controller'), [])],
    { expectedFinanceEmail: FINANCE_ADMIN_EMAIL },
  );
  assert.equal(notEnrolled.ok, true);
  assert.equal(notEnrolled.summary.financeTierApproverCount, 1);
  assert.equal(notEnrolled.summary.financeTierApproverTotpReadyCount, 0);
});

test('readiness stays strict: elevated tier accounts, a second Finance Admin and unknown admins still fail', () => {
  const elevated = summarizeAdminMfaUsers(
    [founder(), financeAdmin(), account('rec', 'recorder@example.invalid', tierClaims('finance_manager', { admin: true }), [totp])],
    { expectedFinanceEmail: FINANCE_ADMIN_EMAIL },
  );
  assert.equal(elevated.ok, false);
  assert.equal(elevated.summary.unexpectedPrivilegedAccountCount, 1);
  assert.equal(elevated.summary.financeTierApproverCount, 0);

  const secondFinanceAdmin = summarizeAdminMfaUsers(
    [founder(), financeAdmin(), account('fa2', 'fa2@example.invalid', { role: 'finance_admin', finance_admin: true }, [totp])],
    { expectedFinanceEmail: FINANCE_ADMIN_EMAIL },
  );
  assert.equal(secondFinanceAdmin.ok, false);
  assert.equal(secondFinanceAdmin.summary.unexpectedPrivilegedAccountCount, 1);

  const unknownAdmin = summarizeAdminMfaUsers(
    [founder(), financeAdmin(), account('ops', 'ops@example.invalid', { role: 'operations_admin' }, [totp])],
    { expectedFinanceEmail: FINANCE_ADMIN_EMAIL },
  );
  assert.equal(unknownAdmin.ok, false);
  assert.equal(unknownAdmin.summary.unexpectedPrivilegedAccountCount, 1);

  const secondFounder = summarizeAdminMfaUsers(
    [founder(), founder(), financeAdmin()],
    { expectedFinanceEmail: FINANCE_ADMIN_EMAIL },
  );
  assert.equal(secondFounder.ok, false);
});

test('privileged-account review never targets a Finance tier approver but still targets unknown admins', () => {
  const privileged = [
    founder(),
    financeAdmin(),
    account('ops', 'ops@example.invalid', { role: 'operations_admin' }, [totp]),
    account('elev', 'elev@example.invalid', tierClaims('finance_manager', { admin: true }), [totp]),
  ];
  const review = summarizePrivilegedAccountReview(privileged, { expectedFinanceEmail: FINANCE_ADMIN_EMAIL });
  assert.equal(review.deletionTargetCount, 2, 'operations_admin and the elevated finance_manager stay targets');
});

test('deploy/owner privileged cleanup explicitly excludes Finance tier approvers and refuses to purge one', async () => {
  const source = await read('scripts/delete-obsolete-privileged-accounts-production.mjs');
  assert.match(source, /isExplicitFinanceTierApprover,\n[^}]*\} from '\.\/verify-admin-mfa-production\.mjs';/);
  // The only other retained identity is the MFA-ready named second approver (Rashid, 18 Nov 2026).
  assert.match(source, /!isConfiguredFinanceApprover\(user, expectedFinanceEmail\) &&\n\s+!isExplicitFinanceTierApprover\(user\) &&\n\s+user\.uid !== retainedSecondApproverUid\n\s+\);\n\n\s+if \(canonical\.length !== 1\)/);
  assert.match(source, /async function purgePrivilegedTarget\(\{ auth, db, target, actor, retainedSecondApproverUid = '' \}\) \{\n\s+if \(isExplicitFinanceTierApprover\(target\)\) \{\n\s+throw new Error/);
  assert.match(source, /remainingUnexpected = remainingPrivileged\.filter\(\(user\) =>[^;]*!isExplicitFinanceTierApprover\(user\)/);
  assert.match(source, /financeTierApproverCount: financeTierApprovers\.length/);
  // Founder singleton and single configured Finance Admin requirements are unchanged.
  assert.match(source, /canonical\.length !== 1/);
  assert.match(source, /financeApprovers\.length !== 1/);
  assert.match(source, /remainingFounder\.length !== 1 \|\| remainingFinance\.length !== 1 \|\| remainingUnexpected\.length !== 0/);
});

test('callable readiness overview mirrors the script classification and keeps dual control strict', async () => {
  const source = await read('functions/adminMfaReadiness.ts');
  assert.match(source, /FINANCE_TIER_APPROVER_ROLES: ReadonlySet<string> = new Set\(\["finance_manager", "finance_controller"\]\)/);
  assert.match(source, /ELEVATED_CLAIM_FLAGS = \["admin", "isAdmin", "super_admin", "superAdmin", "ceo", "manager", "finance_admin"\]/);
  assert.match(source, /if \(claims\[role\] !== true\) return false;/);
  assert.match(source, /if \(claimsGrantAdminPortal\(claims\)\) return false;/);
  assert.match(source, /if \(isExplicitFinanceTierApprover\(user\)\) \{[^]*?financeTierApproverCount \+= 1;[^]*?continue;\n\s+\}\n\s+if \(!claimsGrantAdminPortal\(claims\)\) continue;/);
  assert.match(source, /claimsGrantAdminPortal\(\(user\.customClaims \|\| \{\}\) as Record<string, unknown>\) \|\|\n\s+isExplicitFinanceTierApprover\(user\)/);
  for (const condition of [
    'claimedAdminCount === expectedPrivilegedAccountCount',
    'const expectedPrivilegedAccountCount = secondApproverCount === 1 && secondApproverReadyCount === 1 ? 3 : 2;',
    'secondApproverReadyCount === secondApproverCount',
    'canonicalFounderCount === 1',
    'financeAdminCount === 1',
    'financeAdminReadyCount === 1',
    'unexpectedPrivilegedAccountCount === 0',
  ]) assert.ok(source.includes(condition), condition);

  const script = await read('scripts/verify-admin-mfa-production.mjs');
  assert.match(script, /ELEVATED_CLAIM_FLAGS = \['admin', 'isAdmin', 'super_admin', 'superAdmin', 'ceo', 'manager', 'finance_admin'\]/);
});

test('Finance Manager and Finance Controller can self-enroll TOTP with correct EN/AR labels; others cannot', async () => {
  const source = await read('apps/admin-panel/src/components/security/AdminMfaEnrollmentCard.tsx');
  assert.match(source, /const isFinanceManager = normalizedRole === 'finance_manager';/);
  assert.match(source, /const isFinanceController = normalizedRole === 'finance_controller';/);
  assert.match(source, /const isFinanceApprover = isFinanceAdmin \|\| isFinanceManager \|\| isFinanceController;/);
  assert.match(source, /const canEnrollTotp = isFounder \|\| isFinanceApprover;/);
  assert.ok(source.includes("'Finance Manager'") && source.includes("'مدير المالية'"));
  assert.ok(source.includes("'Finance Controller'") && source.includes("'المراقب المالي'"));
  assert.doesNotMatch(source, /finance_staff'|payroll_admin'/, 'no other role is added to TOTP self-enrollment');
  assert.doesNotMatch(source, /setCustomUserClaims|updateUser\(|deleteUser\(/);
});

test('TOTP enrollment server paths accept the tier roles for self-service only', async () => {
  const profile = await read('functions/adminSecurityProfile.ts');
  assert.match(profile, /FINANCE_TIER_SELF_SERVICE_ROLES = new Set\(\["finance_manager", "finance_controller"\]\)/);
  assert.match(profile, /\(FINANCE_TIER_SELF_SERVICE_ROLES\.has\(role\) && token\[role\] === true\)/);
  assert.match(profile, /if \(!hasAdminAuthority \|\| token\.suspended === true\)/);

  const recovery = await read('functions/adminMfaRecovery.ts');
  const targetRoles = recovery.match(/const ADMIN_TARGET_ROLES = new Set\(\[([^\]]*)\]\)/)?.[1] || '';
  assert.doesNotMatch(targetRoles, /finance_manager|finance_controller/, 'MFA recovery/reset still cannot target tier approvers');
  assert.match(recovery, /SELF_FINALIZE_EXTRA_ROLES = new Set\(\["finance_manager", "finance_controller"\]\)/);
  assert.match(recovery, /SELF_FINALIZE_EXTRA_ROLES\.has\(role\) && token\[role\] === true && token\.suspended !== true/);
});

test('owner evidence resets refuse to delete the Founder, Finance testers or any staff/Admin/Finance account', async () => {
  const env = { E2E_FINANCE_APPROVER_EMAIL: 'fa@example.invalid', E2E_FINANCE_RECORDER_EMAIL: 'rec@example.invalid' };
  const owner = { email: 'owner@example.invalid', customClaims: { role: 'owner', userRole: 'owner', primaryRole: 'owner', admin: false, isAdmin: false } };
  assert.equal(protectedEvidenceIdentityReason(owner, env), '');
  assert.doesNotThrow(() => assertResettableEvidenceIdentity(owner, { env }));
  for (const user of [
    { email: CANONICAL_FOUNDER_EMAIL, customClaims: { role: 'owner' } },
    { email: 'rec@example.invalid', customClaims: { role: 'owner' } },
    { email: 'fa@example.invalid', customClaims: {} },
    { email: 'o2@example.invalid', customClaims: tierClaims('finance_manager') },
    { email: 'o3@example.invalid', customClaims: { role: 'finance_controller' } },
    { email: 'o4@example.invalid', customClaims: { role: 'owner', admin: true } },
  ]) {
    assert.throws(() => assertResettableEvidenceIdentity(user, { env }), /Refusing to delete/);
  }
  for (const file of [
    'scripts/run-owner-inspection-first-production-evidence.mjs',
    'scripts/run-owner-onboarding-production-evidence.mjs',
  ]) {
    const source = await read(file);
    assert.match(source, /const existing = await auth\.getUserByEmail\(ownerEmail\);\n\s+assertResettableEvidenceIdentity\(existing, \{ label: 'owner evidence account' \}\);\n\s+await deleteOwnerScopedRecords\(existing\.uid\);/);
  }
});

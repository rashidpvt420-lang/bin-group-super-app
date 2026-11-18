#!/usr/bin/env node

import admin from 'firebase-admin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EVIDENCE_MAX_AGE_MS = 1000 * 60 * 60 * 24;
const MAX_CLOCK_SKEW_MS = 1000 * 60 * 5;
export const CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups.com';

const ADMIN_ROLES = new Set([
  'admin',
  'super_admin',
  'ceo',
  'manager',
  'operations_admin',
  'finance_admin',
  'hr_admin',
  'support_admin',
  'hr_manager',
  'hr_staff',
  'finance_staff',
  'account_manager',
  'dispatcher',
  'operations_manager',
]);
const FOUNDER_ROLES = new Set(['ceo', 'super_admin']);
const INACTIVE_PROFILE_STATUSES = new Set(['suspended', 'disabled', 'rejected', 'inactive']);

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();

function roleOfClaims(claims = {}) {
  const explicit = lower(claims.role || claims.userRole || claims.primaryRole);
  if (explicit) return explicit;
  if (claims.ceo === true) return 'ceo';
  if (claims.super_admin === true || claims.superAdmin === true) return 'super_admin';
  return '';
}

export function claimsGrantAdminPortal(claims = {}) {
  const role = roleOfClaims(claims);
  return Boolean(
    claims.admin === true ||
    claims.isAdmin === true ||
    claims.super_admin === true ||
    claims.superAdmin === true ||
    claims.ceo === true ||
    claims.manager === true ||
    ADMIN_ROLES.has(role)
  );
}

// Explicit Finance tier approvers (finance_manager / finance_controller), assigned only through the
// two-person adminRequestFinanceRoleAssignment -> adminApproveFinanceRoleAssignment flow. They have no
// Admin-portal authority, so they are expected Finance approvers: never part of the Founder + Finance Admin
// privileged pair and never privileged-cleanup targets. Any account that also carries an elevated flag
// (admin, super admin, CEO, manager, finance_admin) is NOT a tier approver and stays unexpected.
export const FINANCE_TIER_APPROVER_ROLES = new Set(['finance_manager', 'finance_controller']);
const ELEVATED_CLAIM_FLAGS = ['admin', 'isAdmin', 'super_admin', 'superAdmin', 'ceo', 'manager', 'finance_admin'];

export function isExplicitFinanceTierApprover(user) {
  const claims = user?.customClaims || {};
  const role = lower(claims.role || claims.userRole || claims.primaryRole);
  if (!FINANCE_TIER_APPROVER_ROLES.has(role)) return false;
  for (const key of ['role', 'userRole', 'primaryRole']) {
    if (claims[key] !== undefined && claims[key] !== null && lower(claims[key]) !== role) return false;
  }
  if (claims[role] !== true) return false;
  for (const other of FINANCE_TIER_APPROVER_ROLES) {
    if (other !== role && claims[other] === true) return false;
  }
  if (ELEVATED_CLAIM_FLAGS.some((flag) => claims[flag] === true)) return false;
  if (claimsGrantAdminPortal(claims)) return false;
  if (lower(user?.email) === CANONICAL_FOUNDER_EMAIL) return false;
  return true;
}

// Named second approver (Rashid, 18 Nov 2026). Exactly one Super Admin, identified by the protected
// SECOND_APPROVER_EMAIL secret AND the Admin-SDK-only designatedSecondApprover claim set by the
// owner-confirmed Second Approver Bootstrap workflow. It can request and approve Finance grants and do
// other Super Admin non-money work; it is never a Finance money approver, so any Finance, CEO or staff
// flag disqualifies it. When the secret is unset, or the account is absent, readiness stays exactly as
// strict as the Founder + Finance Admin pair; a present but non-MFA-ready account is never accepted.
export const SECOND_APPROVER_EMAIL_ENV = 'SECOND_APPROVER_EMAIL';
export const SECOND_APPROVER_CLAIM = 'designatedSecondApprover';
const SECOND_APPROVER_FORBIDDEN_FLAGS = [
  'ceo',
  'manager',
  'staff',
  'isStaff',
  'technician',
  'finance_admin',
  'finance_manager',
  'finance_controller',
  'finance_staff',
  'payroll_admin',
];

export function secondApproverConfigFailures(secondApproverEmail, { expectedFinanceEmail = '' } = {}) {
  const email = lower(secondApproverEmail);
  if (!email) return [];
  const failures = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) failures.push('SECOND_APPROVER_EMAIL must be a single valid email address.');
  if (email === CANONICAL_FOUNDER_EMAIL) failures.push('SECOND_APPROVER_EMAIL must not be the canonical Founder.');
  if (lower(expectedFinanceEmail) && email === lower(expectedFinanceEmail)) {
    failures.push('SECOND_APPROVER_EMAIL must not be the configured Finance Admin.');
  }
  return failures;
}

export function isConfiguredSecondApprover(user, { secondApproverEmail = '', expectedFinanceEmail = '' } = {}) {
  const email = lower(secondApproverEmail);
  if (!email || secondApproverConfigFailures(email, { expectedFinanceEmail }).length > 0) return false;
  if (lower(user?.email) !== email) return false;
  const claims = user?.customClaims || {};
  for (const key of ['role', 'userRole', 'primaryRole']) {
    if (claims[key] !== undefined && claims[key] !== null && lower(claims[key]) !== 'super_admin') return false;
  }
  if (lower(claims.role) !== 'super_admin') return false;
  if (claims.super_admin !== true) return false;
  if (claims[SECOND_APPROVER_CLAIM] !== true) return false;
  if (SECOND_APPROVER_FORBIDDEN_FLAGS.some((flag) => claims[flag] === true)) return false;
  if (claims.financeAuthorizedAt !== undefined && claims.financeAuthorizedAt !== null) return false;
  if (claims.suspended === true) return false;
  if (FINANCE_TIER_APPROVER_ROLES.has(lower(claims.financeRole))) return false;
  return true;
}

export function secondApproverMfaReady(user) {
  if (user?.disabled === true || user?.emailVerified !== true) return false;
  if (user?.profileExists !== true) return false;
  const profile = user?.profile || {};
  if (profile.suspended === true || INACTIVE_PROFILE_STATUSES.has(lower(profile.status))) return false;
  return enrolledFactorsOf(user).some((factor) => ['phone', 'totp'].includes(lower(factor?.factorId)));
}

function enrolledFactorsOf(user) {
  return Array.isArray(user?.multiFactor?.enrolledFactors) ? user.multiFactor.enrolledFactors : [];
}

export function recoveryApproverRole(claims = {}) {
  const role = roleOfClaims(claims);
  return FOUNDER_ROLES.has(role) ? role : '';
}

export function isCanonicalFounderAccount(user) {
  const role = recoveryApproverRole(user?.customClaims || {});
  return Boolean(role && lower(user?.email) === CANONICAL_FOUNDER_EMAIL);
}

function enrolledFactors(user) {
  return Array.isArray(user?.multiFactor?.enrolledFactors)
    ? user.multiFactor.enrolledFactors
    : [];
}

function profileIsActive(user) {
  if (user?.profileExists === false) return false;
  const profile = user?.profile || {};
  if (profile.suspended === true) return false;
  return !INACTIVE_PROFILE_STATUSES.has(lower(profile.status));
}

export function summarizeAdminMfaUsers(users, { expectedFinanceEmail = '', secondApproverEmail = '' } = {}) {
  const source = Array.isArray(users) ? users : [];
  const normalizedFinanceEmail = lower(expectedFinanceEmail);
  const normalizedSecondApproverEmail = lower(secondApproverEmail);
  const secondApproverConfigured = Boolean(normalizedSecondApproverEmail);
  const secondApproverMisconfiguration = secondApproverConfigFailures(normalizedSecondApproverEmail, { expectedFinanceEmail: normalizedFinanceEmail });
  let secondApproverCandidateCount = 0;
  let secondApproverMfaReadyCount = 0;
  let claimedAdminCount = 0;
  let missingAdminProfileCount = 0;
  let disabledAdminCount = 0;
  let inactiveProfileAdminCount = 0;
  let activeAdminCount = 0;
  let activeAdminEmailUnverifiedCount = 0;
  let phoneMfaEnrolledCount = 0;
  let totpMfaEnrolledCount = 0;
  let unsupportedOnlyFactorCount = 0;
  let canonicalFounderCandidateCount = 0;
  let canonicalFounderMfaReadyCount = 0;
  let canonicalFounderEmailUnverifiedCount = 0;
  let canonicalFounderMissingPhoneFactorCount = 0;
  let financeApproverCandidateCount = 0;
  let financeApproverMfaReadyCount = 0;
  let financeApproverEmailUnverifiedCount = 0;
  let financeApproverMissingTotpFactorCount = 0;
  let unexpectedPrivilegedAccountCount = 0;
  let financeTierApproverCount = 0;
  let financeTierApproverTotpReadyCount = 0;
  const founderRoleCounts = { ceo: 0, super_admin: 0 };

  for (const user of source) {
    const claims = user?.customClaims || {};
    if (isExplicitFinanceTierApprover(user)) {
      // Expected Finance approver, reported only. Never unexpected, never counted in the privileged pair.
      financeTierApproverCount += 1;
      const tierTotp = enrolledFactors(user).some((factor) => lower(factor?.factorId) === 'totp');
      if (user?.disabled !== true && user?.emailVerified === true && tierTotp) financeTierApproverTotpReadyCount += 1;
      continue;
    }
    if (!claimsGrantAdminPortal(claims)) continue;
    claimedAdminCount += 1;

    const role = roleOfClaims(claims);
    const founderRole = recoveryApproverRole(claims);
    const canonicalFounder = isCanonicalFounderAccount(user);
    const configuredFinanceApprover =
      role === 'finance_admin' &&
      (!normalizedFinanceEmail || lower(user?.email) === normalizedFinanceEmail);

    const configuredSecondApprover = !canonicalFounder && !configuredFinanceApprover && isConfiguredSecondApprover(user, {
      secondApproverEmail: normalizedSecondApproverEmail,
      expectedFinanceEmail: normalizedFinanceEmail,
    });

    if (canonicalFounder) {
      canonicalFounderCandidateCount += 1;
      founderRoleCounts[founderRole] += 1;
    } else if (configuredFinanceApprover) {
      financeApproverCandidateCount += 1;
    } else if (configuredSecondApprover) {
      secondApproverCandidateCount += 1;
      if (secondApproverMfaReady(user)) secondApproverMfaReadyCount += 1;
    } else {
      unexpectedPrivilegedAccountCount += 1;
    }

    if (user?.profileExists === false) {
      missingAdminProfileCount += 1;
      continue;
    }
    if (user?.disabled === true) {
      disabledAdminCount += 1;
      continue;
    }
    if (!profileIsActive(user)) {
      inactiveProfileAdminCount += 1;
      continue;
    }

    activeAdminCount += 1;
    if (user?.emailVerified !== true) activeAdminEmailUnverifiedCount += 1;

    const factors = enrolledFactors(user);
    const phoneFactors = factors.filter((factor) => lower(factor?.factorId) === 'phone');
    const totpFactors = factors.filter((factor) => lower(factor?.factorId) === 'totp');
    if (phoneFactors.length > 0) phoneMfaEnrolledCount += 1;
    if (totpFactors.length > 0) totpMfaEnrolledCount += 1;
    if (factors.length > 0 && phoneFactors.length === 0 && totpFactors.length === 0) unsupportedOnlyFactorCount += 1;

    if (canonicalFounder) {
      if (user?.emailVerified !== true) canonicalFounderEmailUnverifiedCount += 1;
      if (phoneFactors.length === 0) canonicalFounderMissingPhoneFactorCount += 1;
      if (user?.emailVerified === true && phoneFactors.length > 0) canonicalFounderMfaReadyCount += 1;
    }

    if (configuredFinanceApprover) {
      if (user?.emailVerified !== true) financeApproverEmailUnverifiedCount += 1;
      if (totpFactors.length === 0) financeApproverMissingTotpFactorCount += 1;
      if (user?.emailVerified === true && totpFactors.length > 0) financeApproverMfaReadyCount += 1;
    }
  }

  // The named second approver is accepted only when it is present AND MFA-ready; otherwise the
  // expected privileged population stays exactly the Founder + Finance Admin pair.
  const secondApproverAccepted =
    secondApproverConfigured &&
    secondApproverMisconfiguration.length === 0 &&
    secondApproverCandidateCount === 1 &&
    secondApproverMfaReadyCount === 1;
  const expectedPrivilegedAccountCount = secondApproverAccepted ? 3 : 2;

  const dualControlReady =
    secondApproverMisconfiguration.length === 0 &&
    secondApproverCandidateCount <= 1 &&
    secondApproverMfaReadyCount === secondApproverCandidateCount &&
    claimedAdminCount === expectedPrivilegedAccountCount &&
    canonicalFounderCandidateCount === 1 &&
    canonicalFounderMfaReadyCount === 1 &&
    canonicalFounderEmailUnverifiedCount === 0 &&
    canonicalFounderMissingPhoneFactorCount === 0 &&
    financeApproverCandidateCount === 1 &&
    financeApproverMfaReadyCount === 1 &&
    financeApproverEmailUnverifiedCount === 0 &&
    financeApproverMissingTotpFactorCount === 0 &&
    unexpectedPrivilegedAccountCount === 0 &&
    missingAdminProfileCount === 0 &&
    disabledAdminCount === 0 &&
    inactiveProfileAdminCount === 0 &&
    activeAdminCount === expectedPrivilegedAccountCount &&
    activeAdminEmailUnverifiedCount === 0;

  const failures = [...secondApproverMisconfiguration];
  if (secondApproverCandidateCount > 1) {
    failures.push('At most one named second approver account may exist.');
  }
  if (secondApproverCandidateCount > secondApproverMfaReadyCount) {
    failures.push('The named second approver must have a verified email, MFA (phone or TOTP) and an active profile before it counts as a privileged account.');
  }
  if (unexpectedPrivilegedAccountCount > 0) {
    failures.push(`${unexpectedPrivilegedAccountCount} unexpected privileged account(s) must be removed; production permits only the canonical Founder and configured Finance Admin.`);
  }
  if (claimedAdminCount !== expectedPrivilegedAccountCount) {
    failures.push(expectedPrivilegedAccountCount === 3
      ? `Exactly three privileged Firebase Auth accounts (Founder, Finance Admin, named second approver) are required; found ${claimedAdminCount}.`
      : `Exactly two privileged Firebase Auth accounts are required for dual control; found ${claimedAdminCount}.`);
  }
  if (canonicalFounderCandidateCount !== 1) {
    failures.push(`Exactly one canonical CEO/Super Admin account must use ${CANONICAL_FOUNDER_EMAIL}.`);
  }
  if (financeApproverCandidateCount !== 1) {
    failures.push('Exactly one configured Finance Admin account must match E2E_FINANCE_APPROVER_EMAIL.');
  }
  if (missingAdminProfileCount > 0) {
    failures.push(`${missingAdminProfileCount} privileged account(s) have no Firestore user profile.`);
  }
  if (disabledAdminCount > 0) {
    failures.push(`${disabledAdminCount} privileged account(s) are disabled.`);
  }
  if (inactiveProfileAdminCount > 0) {
    failures.push(`${inactiveProfileAdminCount} privileged account(s) are inactive.`);
  }
  if (activeAdminCount !== expectedPrivilegedAccountCount) {
    failures.push(`Exactly ${expectedPrivilegedAccountCount} active privileged accounts are required; found ${activeAdminCount}.`);
  }
  if (activeAdminEmailUnverifiedCount > 0) {
    failures.push(`${activeAdminEmailUnverifiedCount} active privileged account(s) have unverified email.`);
  }
  if (canonicalFounderMfaReadyCount !== 1) {
    failures.push(`The canonical founder account ${CANONICAL_FOUNDER_EMAIL} must have verified email and phone MFA.`);
  }
  if (financeApproverMfaReadyCount !== 1) {
    failures.push('The configured Finance Admin must have verified email and TOTP MFA.');
  }

  return {
    ok: failures.length === 0,
    failures,
    summary: {
      claimedAdminCount,
      missingAdminProfileCount,
      disabledAdminCount,
      inactiveProfileAdminCount,
      activeAdminCount,
      activeAdminEmailUnverifiedCount,
      phoneMfaEnrolledCount,
      totpMfaEnrolledCount,
      unsupportedOnlyFactorCount,
      canonicalFounderCandidateCount,
      canonicalFounderMfaReadyCount,
      canonicalFounderEmailUnverifiedCount,
      canonicalFounderMissingPhoneFactorCount,
      financeApproverCandidateCount,
      financeApproverMfaReadyCount,
      financeApproverEmailUnverifiedCount,
      financeApproverMissingTotpFactorCount,
      unexpectedPrivilegedAccountCount,
      financeTierApproverCount,
      financeTierApproverTotpReadyCount,
      secondApproverConfigured,
      secondApproverCandidateCount,
      secondApproverMfaReadyCount,
      expectedPrivilegedAccountCount,
      canonicalFounderCeoCount: founderRoleCounts.ceo,
      canonicalFounderSuperAdminCount: founderRoleCounts.super_admin,
      dualControlReady,
      allActiveAdminsEmailVerified: activeAdminCount === expectedPrivilegedAccountCount && activeAdminEmailUnverifiedCount === 0,
      // Compatibility aliases retained for deployment readers and the current Admin UI.
      founderSingletonReady: dualControlReady,
      allActiveAdminsPhoneMfaReady: canonicalFounderMfaReadyCount === 1,
      missingPhoneFactorCount: canonicalFounderMissingPhoneFactorCount,
      recoveryApproverCandidateCount: canonicalFounderCandidateCount,
      recoveryApproverMfaReadyCount: canonicalFounderMfaReadyCount,
      recoveryApproverEmailUnverifiedCount: canonicalFounderEmailUnverifiedCount,
      recoveryApproverMissingPhoneFactorCount: canonicalFounderMissingPhoneFactorCount,
      recoveryCeoCount: founderRoleCounts.ceo,
      recoverySuperAdminCount: founderRoleCounts.super_admin,
      recoveryQuorumReady: dualControlReady,
    },
  };
}

export function buildAdminMfaEvidence(summary, {
  env = process.env,
  now = new Date(),
} = {}) {
  for (const field of [
    'activeAdminEmailUnverifiedCount',
    'canonicalFounderCandidateCount',
    'canonicalFounderMfaReadyCount',
    'unexpectedPrivilegedAccountCount',
    'financeApproverCandidateCount',
    'financeApproverMfaReadyCount',
  ]) {
    if (!Number.isInteger(summary?.[field])) {
      throw new Error(`Admin MFA summary must explicitly include ${field}.`);
    }
  }
  if (typeof summary?.dualControlReady !== 'boolean') {
    throw new Error('Admin MFA summary must explicitly include dualControlReady.');
  }
  if (typeof summary?.allActiveAdminsEmailVerified !== 'boolean') {
    throw new Error('Admin MFA summary must explicitly include allActiveAdminsEmailVerified.');
  }

  return {
    schemaVersion: 4,
    status: 'passed',
    source: 'firebase-admin-auth-and-firestore-founder-finance-dual-control',
    projectId: EXPECTED_PROJECT_ID,
    commitSha: text(env.GITHUB_SHA) || null,
    repository: text(env.GITHUB_REPOSITORY) || null,
    ref: text(env.GITHUB_REF) || null,
    workflowRunId: text(env.GITHUB_RUN_ID) || null,
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT || 0) || null,
    verifiedAt: now.toISOString(),
    claimedAdminCount: Number(summary.claimedAdminCount),
    missingAdminProfileCount: Number(summary.missingAdminProfileCount),
    disabledAdminCount: Number(summary.disabledAdminCount),
    inactiveProfileAdminCount: Number(summary.inactiveProfileAdminCount),
    activeAdminCount: Number(summary.activeAdminCount),
    activeAdminEmailUnverifiedCount: Number(summary.activeAdminEmailUnverifiedCount),
    phoneMfaEnrolledCount: Number(summary.phoneMfaEnrolledCount),
    totpMfaEnrolledCount: Number(summary.totpMfaEnrolledCount),
    missingPhoneFactorCount: Number(summary.missingPhoneFactorCount),
    unsupportedOnlyFactorCount: Number(summary.unsupportedOnlyFactorCount),
    canonicalFounderCandidateCount: Number(summary.canonicalFounderCandidateCount),
    canonicalFounderMfaReadyCount: Number(summary.canonicalFounderMfaReadyCount),
    canonicalFounderEmailUnverifiedCount: Number(summary.canonicalFounderEmailUnverifiedCount),
    canonicalFounderMissingPhoneFactorCount: Number(summary.canonicalFounderMissingPhoneFactorCount),
    financeApproverCandidateCount: Number(summary.financeApproverCandidateCount),
    financeApproverMfaReadyCount: Number(summary.financeApproverMfaReadyCount),
    financeApproverEmailUnverifiedCount: Number(summary.financeApproverEmailUnverifiedCount),
    financeApproverMissingTotpFactorCount: Number(summary.financeApproverMissingTotpFactorCount),
    unexpectedPrivilegedAccountCount: Number(summary.unexpectedPrivilegedAccountCount),
    canonicalFounderCeoCount: Number(summary.canonicalFounderCeoCount),
    canonicalFounderSuperAdminCount: Number(summary.canonicalFounderSuperAdminCount),
    secondApproverConfigured: summary.secondApproverConfigured === true,
    secondApproverCandidateCount: Number(summary.secondApproverCandidateCount || 0),
    secondApproverMfaReadyCount: Number(summary.secondApproverMfaReadyCount || 0),
    expectedPrivilegedAccountCount: Number(summary.expectedPrivilegedAccountCount || 2),
    dualControlReady: summary.dualControlReady === true,
    founderSingletonReady: summary.dualControlReady === true,
    allActiveAdminsEmailVerified: summary.allActiveAdminsEmailVerified === true,
    allActiveAdminsPhoneMfaReady: summary.allActiveAdminsPhoneMfaReady === true,
    recoveryApproverCandidateCount: Number(summary.recoveryApproverCandidateCount),
    recoveryApproverMfaReadyCount: Number(summary.recoveryApproverMfaReadyCount),
    recoveryApproverEmailUnverifiedCount: Number(summary.recoveryApproverEmailUnverifiedCount),
    recoveryApproverMissingPhoneFactorCount: Number(summary.recoveryApproverMissingPhoneFactorCount),
    recoveryCeoCount: Number(summary.recoveryCeoCount),
    recoverySuperAdminCount: Number(summary.recoverySuperAdminCount),
    recoveryQuorumReady: summary.recoveryQuorumReady === true,
    sensitiveValuesExcluded: true,
    hardLaunchClaim: false,
  };
}

export function validateAdminMfaEvidence(evidence, {
  commitSha,
  repository,
  ref,
  workflowRunId,
  workflowRunAttempt,
  now = Date.now(),
  maxAgeMs = EVIDENCE_MAX_AGE_MS,
} = {}) {
  const failures = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return ['Admin MFA deployment evidence is missing.'];
  }
  const requireExact = (actual, expected, label) => {
    if (String(actual ?? '') !== String(expected ?? '')) failures.push(`${label} mismatch.`);
  };

  requireExact(evidence.schemaVersion, 4, 'Admin MFA evidence schemaVersion');
  requireExact(evidence.status, 'passed', 'Admin MFA evidence status');
  requireExact(evidence.source, 'firebase-admin-auth-and-firestore-founder-finance-dual-control', 'Admin MFA evidence source');
  requireExact(evidence.projectId, EXPECTED_PROJECT_ID, 'Admin MFA evidence projectId');
  requireExact(evidence.commitSha, commitSha, 'Admin MFA evidence commitSha');
  requireExact(evidence.repository, repository, 'Admin MFA evidence repository');
  requireExact(evidence.ref, ref, 'Admin MFA evidence ref');
  requireExact(evidence.workflowRunId, workflowRunId, 'Admin MFA evidence workflowRunId');
  requireExact(evidence.workflowRunAttempt, workflowRunAttempt, 'Admin MFA evidence workflowRunAttempt');
  // Evidence without second-approver fields is read as "no second approver": exactly two accounts.
  const secondApproverCount = evidence.secondApproverCandidateCount === undefined ? 0 : evidence.secondApproverCandidateCount;
  const secondApproverReady = evidence.secondApproverMfaReadyCount === undefined ? 0 : evidence.secondApproverMfaReadyCount;
  if (![0, 1].includes(secondApproverCount)) failures.push('Admin MFA second approver count must be 0 or 1.');
  if (secondApproverReady !== secondApproverCount) failures.push('Admin MFA second approver must be MFA-ready to count.');
  if (secondApproverCount === 1 && evidence.secondApproverConfigured !== true) {
    failures.push('Admin MFA second approver must be named by SECOND_APPROVER_EMAIL.');
  }
  const expectedPrivileged = secondApproverCount === 1 && secondApproverReady === 1 ? 3 : 2;
  if (evidence.expectedPrivilegedAccountCount !== undefined) {
    requireExact(evidence.expectedPrivilegedAccountCount, expectedPrivileged, 'Admin MFA expected privileged account count');
  }
  requireExact(evidence.claimedAdminCount, expectedPrivileged, 'Admin MFA exact privileged account count');
  requireExact(evidence.activeAdminCount, expectedPrivileged, 'Admin MFA exact active privileged account count');
  requireExact(evidence.canonicalFounderCandidateCount, 1, 'Admin MFA canonical founder count');
  requireExact(evidence.canonicalFounderMfaReadyCount, 1, 'Admin MFA canonical founder readiness');
  requireExact(evidence.financeApproverCandidateCount, 1, 'Admin MFA Finance approver count');
  requireExact(evidence.financeApproverMfaReadyCount, 1, 'Admin MFA Finance approver readiness');
  requireExact(evidence.financeApproverEmailUnverifiedCount, 0, 'Admin MFA Finance approver email verification');
  requireExact(evidence.financeApproverMissingTotpFactorCount, 0, 'Admin MFA Finance approver TOTP coverage');
  requireExact(evidence.unexpectedPrivilegedAccountCount, 0, 'Admin MFA unexpected privileged accounts');
  requireExact(evidence.dualControlReady, true, 'Admin MFA dual-control readiness');
  requireExact(evidence.founderSingletonReady, true, 'Admin MFA compatibility readiness');
  requireExact(evidence.allActiveAdminsEmailVerified, true, 'Admin MFA all-active email verification');
  requireExact(evidence.activeAdminEmailUnverifiedCount, 0, 'Admin MFA unverified active Admin emails');
  requireExact(evidence.allActiveAdminsPhoneMfaReady, true, 'Admin MFA canonical Founder phone-MFA coverage');
  requireExact(evidence.missingAdminProfileCount, 0, 'Admin MFA missing profiles');
  requireExact(evidence.disabledAdminCount, 0, 'Admin MFA disabled privileged accounts');
  requireExact(evidence.inactiveProfileAdminCount, 0, 'Admin MFA inactive privileged accounts');
  requireExact(evidence.missingPhoneFactorCount, 0, 'Admin MFA missing phone factors');
  requireExact(evidence.recoveryQuorumReady, true, 'Admin MFA compatibility readiness alias');
  requireExact(evidence.sensitiveValuesExcluded, true, 'Admin MFA sensitiveValuesExcluded');
  requireExact(evidence.hardLaunchClaim, false, 'Admin MFA hardLaunchClaim');

  for (const key of [
    'claimedAdminCount',
    'missingAdminProfileCount',
    'disabledAdminCount',
    'inactiveProfileAdminCount',
    'activeAdminCount',
    'activeAdminEmailUnverifiedCount',
    'phoneMfaEnrolledCount',
    'totpMfaEnrolledCount',
    'missingPhoneFactorCount',
    'unsupportedOnlyFactorCount',
    'canonicalFounderCandidateCount',
    'canonicalFounderMfaReadyCount',
    'canonicalFounderEmailUnverifiedCount',
    'canonicalFounderMissingPhoneFactorCount',
    'financeApproverCandidateCount',
    'financeApproverMfaReadyCount',
    'financeApproverEmailUnverifiedCount',
    'financeApproverMissingTotpFactorCount',
    'unexpectedPrivilegedAccountCount',
    'canonicalFounderCeoCount',
    'canonicalFounderSuperAdminCount',
    'recoveryApproverCandidateCount',
    'recoveryApproverMfaReadyCount',
    'recoveryApproverEmailUnverifiedCount',
    'recoveryApproverMissingPhoneFactorCount',
    'recoveryCeoCount',
    'recoverySuperAdminCount',
  ]) {
    if (!Number.isInteger(evidence[key]) || evidence[key] < 0) {
      failures.push(`Admin MFA evidence ${key} must be a non-negative integer.`);
    }
  }

  if (evidence.phoneMfaEnrolledCount < 1) {
    failures.push('Admin MFA evidence requires the canonical Founder phone-MFA factor.');
  }
  if (evidence.totpMfaEnrolledCount < 1) {
    failures.push('Admin MFA evidence requires the Finance Admin TOTP factor.');
  }
  if (evidence.recoveryApproverCandidateCount !== evidence.canonicalFounderCandidateCount) {
    failures.push('Admin MFA compatibility founder candidate count mismatch.');
  }
  if (evidence.recoveryApproverMfaReadyCount !== evidence.canonicalFounderMfaReadyCount) {
    failures.push('Admin MFA compatibility founder ready count mismatch.');
  }

  const verifiedAt = Date.parse(text(evidence.verifiedAt));
  if (!Number.isFinite(verifiedAt)) {
    failures.push('Admin MFA evidence verifiedAt must be a valid ISO timestamp.');
  } else {
    if (verifiedAt > now + MAX_CLOCK_SKEW_MS) failures.push('Admin MFA evidence verifiedAt is in the future.');
    if (now - verifiedAt > maxAgeMs) failures.push('Admin MFA evidence verifiedAt is stale.');
  }

  for (const forbidden of [
    'uid',
    'uids',
    'email',
    'emails',
    'phoneNumber',
    'phoneNumbers',
    'displayName',
    'factorUid',
    'factorUids',
  ]) {
    if (Object.prototype.hasOwnProperty.call(evidence, forbidden)) {
      failures.push(`Admin MFA evidence must not contain ${forbidden}.`);
    }
  }
  return failures;
}

export async function fetchAllAuthUsers({ authClient } = {}) {
  const client = authClient || admin.auth();
  const users = [];
  let pageToken;
  do {
    const page = await client.listUsers(1000, pageToken);
    users.push(...(page.users || []));
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

export async function attachAdminProfiles(users, { firestoreClient } = {}) {
  const db = firestoreClient || admin.firestore();
  const source = Array.isArray(users) ? users : [];
  const claimedAdmins = source.filter((user) => claimsGrantAdminPortal(user?.customClaims || {}));
  const profileMap = new Map();
  for (let offset = 0; offset < claimedAdmins.length; offset += 100) {
    const chunk = claimedAdmins.slice(offset, offset + 100);
    const refs = chunk.map((user) => db.collection('users').doc(user.uid));
    const snapshots = refs.length > 0 ? await db.getAll(...refs) : [];
    snapshots.forEach((snapshot) => {
      profileMap.set(snapshot.id, {
        profileExists: snapshot.exists,
        profile: snapshot.data() || {},
      });
    });
  }
  return source.map((user) => {
    if (!claimsGrantAdminPortal(user?.customClaims || {})) return user;
    const profileState = profileMap.get(user.uid) || { profileExists: false, profile: {} };
    return { ...user, ...profileState };
  });
}

export async function verifyAdminMfaProduction({
  projectId = resolveFirebaseAdminProjectId(),
  authClient,
  firestoreClient,
  env = process.env,
  now = new Date(),
} = {}) {
  if (text(projectId) !== EXPECTED_PROJECT_ID) {
    throw new Error(`GCP_PROJECT_ID must equal ${EXPECTED_PROJECT_ID}.`);
  }
  initializeFirebaseAdmin(admin, projectId);
  const users = await fetchAllAuthUsers({ authClient });
  const enrichedUsers = await attachAdminProfiles(users, { firestoreClient });
  const result = summarizeAdminMfaUsers(enrichedUsers, {
    expectedFinanceEmail: env.E2E_FINANCE_APPROVER_EMAIL,
    secondApproverEmail: env[SECOND_APPROVER_EMAIL_ENV],
  });
  if (!result.ok) {
    throw new Error(`Admin MFA production coverage is not launch-safe: ${result.failures.join('; ')}`);
  }
  const evidence = buildAdminMfaEvidence(result.summary, { env, now });
  console.log(
    '[admin-mfa] founder-finance dual-control coverage passed '
      + `active=${result.summary.activeAdminCount} `
      + `founder_ready=${result.summary.canonicalFounderMfaReadyCount} `
      + `finance_ready=${result.summary.financeApproverMfaReadyCount} `
      + `unexpected_privileged=${result.summary.unexpectedPrivilegedAccountCount} `
      + `finance_tier_approvers=${result.summary.financeTierApproverCount} `
      + `finance_tier_totp_ready=${result.summary.financeTierApproverTotpReadyCount} `
      + `second_approver_ready=${result.summary.secondApproverMfaReadyCount}`,
  );
  return evidence;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  verifyAdminMfaProduction().catch((error) => {
    const message = error instanceof Error ? error.message : 'Admin MFA production preflight failed.';
    console.error(`[admin-mfa] ${message}`);
    process.exit(1);
  });
}

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

export function summarizeAdminMfaUsers(users) {
  const source = Array.isArray(users) ? users : [];
  let claimedAdminCount = 0;
  let missingAdminProfileCount = 0;
  let disabledAdminCount = 0;
  let inactiveProfileAdminCount = 0;
  let activeAdminCount = 0;
  let activeAdminEmailUnverifiedCount = 0;
  let phoneMfaEnrolledCount = 0;
  let missingPhoneFactorCount = 0;
  let unsupportedOnlyFactorCount = 0;
  let canonicalFounderCandidateCount = 0;
  let canonicalFounderMfaReadyCount = 0;
  let canonicalFounderEmailUnverifiedCount = 0;
  let canonicalFounderMissingPhoneFactorCount = 0;
  let unexpectedPrivilegedAccountCount = 0;
  const founderRoleCounts = { ceo: 0, super_admin: 0 };

  for (const user of source) {
    const claims = user?.customClaims || {};
    if (!claimsGrantAdminPortal(claims)) continue;
    claimedAdminCount += 1;

    const founderRole = recoveryApproverRole(claims);
    const canonicalFounder = isCanonicalFounderAccount(user);
    if (canonicalFounder) {
      canonicalFounderCandidateCount += 1;
      founderRoleCounts[founderRole] += 1;
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
    if (phoneFactors.length > 0) {
      phoneMfaEnrolledCount += 1;
    } else {
      missingPhoneFactorCount += 1;
      if (factors.length > 0) unsupportedOnlyFactorCount += 1;
    }

    if (!canonicalFounder) continue;
    if (user?.emailVerified !== true) canonicalFounderEmailUnverifiedCount += 1;
    if (phoneFactors.length === 0) canonicalFounderMissingPhoneFactorCount += 1;
    if (user?.emailVerified === true && phoneFactors.length > 0) {
      canonicalFounderMfaReadyCount += 1;
    }
  }

  const founderSingletonReady =
    claimedAdminCount === 1 &&
    unexpectedPrivilegedAccountCount === 0 &&
    canonicalFounderCandidateCount === 1 &&
    canonicalFounderMfaReadyCount === 1 &&
    canonicalFounderEmailUnverifiedCount === 0 &&
    canonicalFounderMissingPhoneFactorCount === 0 &&
    missingAdminProfileCount === 0 &&
    disabledAdminCount === 0 &&
    inactiveProfileAdminCount === 0 &&
    activeAdminCount === 1;
  const allActiveAdminsEmailVerified =
    activeAdminCount === 1 && activeAdminEmailUnverifiedCount === 0;
  const allActiveAdminsPhoneMfaReady =
    activeAdminCount === 1 && phoneMfaEnrolledCount === 1;

  const failures = [];
  if (claimedAdminCount === 0) {
    failures.push('No Firebase Auth account with approved Admin/staff claims was found.');
  }
  if (unexpectedPrivilegedAccountCount > 0) {
    failures.push(`${unexpectedPrivilegedAccountCount} unexpected privileged account(s) must be deleted; only ${CANONICAL_FOUNDER_EMAIL} may retain Admin authority.`);
  }
  if (claimedAdminCount !== 1) {
    failures.push(`Exactly one privileged Firebase Auth account is required; found ${claimedAdminCount}.`);
  }
  if (canonicalFounderCandidateCount !== 1) {
    failures.push(`Exactly one canonical CEO/Super Admin account must use ${CANONICAL_FOUNDER_EMAIL}.`);
  }
  if (missingAdminProfileCount > 0) {
    failures.push(`${missingAdminProfileCount} privileged account(s) have no Firestore user profile.`);
  }
  if (disabledAdminCount > 0) {
    failures.push(`${disabledAdminCount} privileged account(s) remain disabled instead of being deleted.`);
  }
  if (inactiveProfileAdminCount > 0) {
    failures.push(`${inactiveProfileAdminCount} privileged account(s) remain inactive instead of being deleted.`);
  }
  if (activeAdminCount !== 1) {
    failures.push(`Exactly one active privileged account is required; found ${activeAdminCount}.`);
  }
  if (activeAdminEmailUnverifiedCount > 0) {
    failures.push(`${activeAdminEmailUnverifiedCount} active privileged account(s) have unverified email.`);
  }
  if (missingPhoneFactorCount > 0) {
    failures.push(`${missingPhoneFactorCount} active privileged account(s) have no enrolled phone MFA factor.`);
  }
  if (canonicalFounderMfaReadyCount !== 1) {
    failures.push(`The canonical founder account ${CANONICAL_FOUNDER_EMAIL} must have verified email and phone MFA.`);
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
      missingPhoneFactorCount,
      unsupportedOnlyFactorCount,
      canonicalFounderCandidateCount,
      canonicalFounderMfaReadyCount,
      canonicalFounderEmailUnverifiedCount,
      canonicalFounderMissingPhoneFactorCount,
      unexpectedPrivilegedAccountCount,
      canonicalFounderCeoCount: founderRoleCounts.ceo,
      canonicalFounderSuperAdminCount: founderRoleCounts.super_admin,
      founderSingletonReady,
      allActiveAdminsEmailVerified,
      allActiveAdminsPhoneMfaReady,
      // Compatibility aliases retained for deployment readers and the current Admin UI.
      recoveryApproverCandidateCount: canonicalFounderCandidateCount,
      recoveryApproverMfaReadyCount: canonicalFounderMfaReadyCount,
      recoveryApproverEmailUnverifiedCount: canonicalFounderEmailUnverifiedCount,
      recoveryApproverMissingPhoneFactorCount: canonicalFounderMissingPhoneFactorCount,
      recoveryCeoCount: founderRoleCounts.ceo,
      recoverySuperAdminCount: founderRoleCounts.super_admin,
      recoveryQuorumReady: founderSingletonReady,
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
  ]) {
    if (!Number.isInteger(summary?.[field])) {
      throw new Error(`Admin MFA summary must explicitly include ${field}.`);
    }
  }
  if (typeof summary?.founderSingletonReady !== 'boolean') {
    throw new Error('Admin MFA summary must explicitly include founderSingletonReady.');
  }
  if (typeof summary?.allActiveAdminsEmailVerified !== 'boolean') {
    throw new Error('Admin MFA summary must explicitly include allActiveAdminsEmailVerified.');
  }

  return {
    schemaVersion: 3,
    status: 'passed',
    source: 'firebase-admin-auth-and-firestore-single-founder-profile',
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
    missingPhoneFactorCount: Number(summary.missingPhoneFactorCount),
    unsupportedOnlyFactorCount: Number(summary.unsupportedOnlyFactorCount),
    canonicalFounderCandidateCount: Number(summary.canonicalFounderCandidateCount),
    canonicalFounderMfaReadyCount: Number(summary.canonicalFounderMfaReadyCount),
    canonicalFounderEmailUnverifiedCount: Number(summary.canonicalFounderEmailUnverifiedCount),
    canonicalFounderMissingPhoneFactorCount: Number(summary.canonicalFounderMissingPhoneFactorCount),
    unexpectedPrivilegedAccountCount: Number(summary.unexpectedPrivilegedAccountCount),
    canonicalFounderCeoCount: Number(summary.canonicalFounderCeoCount),
    canonicalFounderSuperAdminCount: Number(summary.canonicalFounderSuperAdminCount),
    founderSingletonReady: summary.founderSingletonReady === true,
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

  requireExact(evidence.schemaVersion, 3, 'Admin MFA evidence schemaVersion');
  requireExact(evidence.status, 'passed', 'Admin MFA evidence status');
  requireExact(evidence.source, 'firebase-admin-auth-and-firestore-single-founder-profile', 'Admin MFA evidence source');
  requireExact(evidence.projectId, EXPECTED_PROJECT_ID, 'Admin MFA evidence projectId');
  requireExact(evidence.commitSha, commitSha, 'Admin MFA evidence commitSha');
  requireExact(evidence.repository, repository, 'Admin MFA evidence repository');
  requireExact(evidence.ref, ref, 'Admin MFA evidence ref');
  requireExact(evidence.workflowRunId, workflowRunId, 'Admin MFA evidence workflowRunId');
  requireExact(evidence.workflowRunAttempt, workflowRunAttempt, 'Admin MFA evidence workflowRunAttempt');
  requireExact(evidence.claimedAdminCount, 1, 'Admin MFA exact privileged account count');
  requireExact(evidence.activeAdminCount, 1, 'Admin MFA exact active privileged account count');
  requireExact(evidence.canonicalFounderCandidateCount, 1, 'Admin MFA canonical founder count');
  requireExact(evidence.canonicalFounderMfaReadyCount, 1, 'Admin MFA canonical founder readiness');
  requireExact(evidence.unexpectedPrivilegedAccountCount, 0, 'Admin MFA unexpected privileged accounts');
  requireExact(evidence.founderSingletonReady, true, 'Admin MFA founder singleton readiness');
  requireExact(evidence.allActiveAdminsEmailVerified, true, 'Admin MFA all-active email verification');
  requireExact(evidence.activeAdminEmailUnverifiedCount, 0, 'Admin MFA unverified active Admin emails');
  requireExact(evidence.allActiveAdminsPhoneMfaReady, true, 'Admin MFA all-active coverage');
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
    'missingPhoneFactorCount',
    'unsupportedOnlyFactorCount',
    'canonicalFounderCandidateCount',
    'canonicalFounderMfaReadyCount',
    'canonicalFounderEmailUnverifiedCount',
    'canonicalFounderMissingPhoneFactorCount',
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

  if (evidence.phoneMfaEnrolledCount !== 1) {
    failures.push('Admin MFA evidence requires exactly one phone-MFA enrolled privileged account.');
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
  const result = summarizeAdminMfaUsers(enrichedUsers);
  if (!result.ok) {
    throw new Error(`Admin MFA production coverage is not launch-safe: ${result.failures.join('; ')}`);
  }
  const evidence = buildAdminMfaEvidence(result.summary, { env, now });
  console.log(
    '[admin-mfa] single-founder production coverage passed '
      + `active=${result.summary.activeAdminCount} `
      + `phone_mfa=${result.summary.phoneMfaEnrolledCount} `
      + `founder_ready=${result.summary.canonicalFounderMfaReadyCount} `
      + `unexpected_privileged=${result.summary.unexpectedPrivilegedAccountCount}`,
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

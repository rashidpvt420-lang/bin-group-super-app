#!/usr/bin/env node

import admin from 'firebase-admin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EVIDENCE_MAX_AGE_MS = 1000 * 60 * 60 * 24;
const MAX_CLOCK_SKEW_MS = 1000 * 60 * 5;
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
const RECOVERY_APPROVER_ROLES = new Set(['ceo', 'super_admin']);
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
  return RECOVERY_APPROVER_ROLES.has(role) ? role : '';
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
  let recoveryApproverCandidateCount = 0;
  let recoveryApproverMfaReadyCount = 0;
  let recoveryApproverEmailUnverifiedCount = 0;
  let recoveryApproverMissingPhoneFactorCount = 0;
  const recoveryRoleCounts = { ceo: 0, super_admin: 0 };

  for (const user of source) {
    const claims = user?.customClaims || {};
    if (!claimsGrantAdminPortal(claims)) continue;
    claimedAdminCount += 1;

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

    const recoveryRole = recoveryApproverRole(claims);
    if (!recoveryRole) continue;
    recoveryApproverCandidateCount += 1;
    recoveryRoleCounts[recoveryRole] += 1;
    if (user?.emailVerified !== true) recoveryApproverEmailUnverifiedCount += 1;
    if (phoneFactors.length === 0) recoveryApproverMissingPhoneFactorCount += 1;
    if (user?.emailVerified === true && phoneFactors.length > 0) {
      recoveryApproverMfaReadyCount += 1;
    }
  }

  const recoveryQuorumReady =
    recoveryApproverCandidateCount >= 2 &&
    recoveryApproverMfaReadyCount >= 2 &&
    recoveryApproverEmailUnverifiedCount === 0 &&
    recoveryApproverMissingPhoneFactorCount === 0;
  const allActiveAdminsEmailVerified =
    activeAdminCount > 0 && activeAdminEmailUnverifiedCount === 0;
  const allActiveAdminsPhoneMfaReady =
    activeAdminCount > 0 && phoneMfaEnrolledCount === activeAdminCount;

  const failures = [];
  if (activeAdminCount === 0) {
    failures.push('No active Firebase Auth account with approved Admin/staff claims and an active profile was found.');
  }
  if (missingAdminProfileCount > 0) {
    failures.push(`${missingAdminProfileCount} claimed Admin/staff account(s) have no Firestore user profile.`);
  }
  if (activeAdminEmailUnverifiedCount > 0) {
    failures.push(`${activeAdminEmailUnverifiedCount} active Admin/staff account(s) have unverified email.`);
  }
  if (missingPhoneFactorCount > 0) {
    failures.push(`${missingPhoneFactorCount} active Admin/staff account(s) have no enrolled phone MFA factor.`);
  }
  if (recoveryApproverCandidateCount < 2) {
    failures.push('At least two distinct active CEO/Super Admin recovery approver accounts are required.');
  }
  if (recoveryApproverMfaReadyCount < 2) {
    failures.push('At least two distinct CEO/Super Admin recovery approvers must have verified email and phone MFA.');
  }
  if (recoveryApproverEmailUnverifiedCount > 0) {
    failures.push(`${recoveryApproverEmailUnverifiedCount} active recovery approver account(s) have unverified email.`);
  }
  if (recoveryApproverMissingPhoneFactorCount > 0) {
    failures.push(`${recoveryApproverMissingPhoneFactorCount} active recovery approver account(s) have no enrolled phone MFA factor.`);
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
      recoveryApproverCandidateCount,
      recoveryApproverMfaReadyCount,
      recoveryApproverEmailUnverifiedCount,
      recoveryApproverMissingPhoneFactorCount,
      recoveryCeoCount: recoveryRoleCounts.ceo,
      recoverySuperAdminCount: recoveryRoleCounts.super_admin,
      recoveryQuorumReady,
      allActiveAdminsEmailVerified,
      allActiveAdminsPhoneMfaReady,
    },
  };
}

export function buildAdminMfaEvidence(summary, {
  env = process.env,
  now = new Date(),
} = {}) {
  if (!Number.isInteger(summary?.activeAdminEmailUnverifiedCount)) {
    throw new Error('Admin MFA summary must explicitly include activeAdminEmailUnverifiedCount.');
  }
  if (typeof summary?.allActiveAdminsEmailVerified !== 'boolean') {
    throw new Error('Admin MFA summary must explicitly include allActiveAdminsEmailVerified.');
  }
  const activeAdminCount = Number(summary?.activeAdminCount || 0);
  const activeAdminEmailUnverifiedCount = summary.activeAdminEmailUnverifiedCount;
  const allActiveAdminsEmailVerified = summary.allActiveAdminsEmailVerified === true;

  return {
    schemaVersion: 2,
    status: 'passed',
    source: 'firebase-admin-auth-and-firestore-admin-profiles',
    projectId: EXPECTED_PROJECT_ID,
    commitSha: text(env.GITHUB_SHA) || null,
    repository: text(env.GITHUB_REPOSITORY) || null,
    ref: text(env.GITHUB_REF) || null,
    workflowRunId: text(env.GITHUB_RUN_ID) || null,
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT || 0) || null,
    verifiedAt: now.toISOString(),
    claimedAdminCount: Number(summary?.claimedAdminCount || 0),
    missingAdminProfileCount: Number(summary?.missingAdminProfileCount || 0),
    disabledAdminCount: Number(summary?.disabledAdminCount || 0),
    inactiveProfileAdminCount: Number(summary?.inactiveProfileAdminCount || 0),
    activeAdminCount,
    activeAdminEmailUnverifiedCount,
    phoneMfaEnrolledCount: Number(summary?.phoneMfaEnrolledCount || 0),
    missingPhoneFactorCount: Number(summary?.missingPhoneFactorCount || 0),
    unsupportedOnlyFactorCount: Number(summary?.unsupportedOnlyFactorCount || 0),
    recoveryApproverCandidateCount: Number(summary?.recoveryApproverCandidateCount || 0),
    recoveryApproverMfaReadyCount: Number(summary?.recoveryApproverMfaReadyCount || 0),
    recoveryApproverEmailUnverifiedCount: Number(summary?.recoveryApproverEmailUnverifiedCount || 0),
    recoveryApproverMissingPhoneFactorCount: Number(summary?.recoveryApproverMissingPhoneFactorCount || 0),
    recoveryCeoCount: Number(summary?.recoveryCeoCount || 0),
    recoverySuperAdminCount: Number(summary?.recoverySuperAdminCount || 0),
    recoveryQuorumReady: summary?.recoveryQuorumReady === true,
    allActiveAdminsEmailVerified,
    allActiveAdminsPhoneMfaReady: summary?.allActiveAdminsPhoneMfaReady === true,
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
  requireExact(evidence.schemaVersion, 2, 'Admin MFA evidence schemaVersion');
  requireExact(evidence.status, 'passed', 'Admin MFA evidence status');
  requireExact(evidence.source, 'firebase-admin-auth-and-firestore-admin-profiles', 'Admin MFA evidence source');
  requireExact(evidence.projectId, EXPECTED_PROJECT_ID, 'Admin MFA evidence projectId');
  requireExact(evidence.commitSha, commitSha, 'Admin MFA evidence commitSha');
  requireExact(evidence.repository, repository, 'Admin MFA evidence repository');
  requireExact(evidence.ref, ref, 'Admin MFA evidence ref');
  requireExact(evidence.workflowRunId, workflowRunId, 'Admin MFA evidence workflowRunId');
  requireExact(evidence.workflowRunAttempt, workflowRunAttempt, 'Admin MFA evidence workflowRunAttempt');
  requireExact(evidence.allActiveAdminsEmailVerified, true, 'Admin MFA all-active email verification');
  requireExact(evidence.activeAdminEmailUnverifiedCount, 0, 'Admin MFA unverified active Admin emails');
  requireExact(evidence.allActiveAdminsPhoneMfaReady, true, 'Admin MFA all-active coverage');
  requireExact(evidence.missingAdminProfileCount, 0, 'Admin MFA missing profiles');
  requireExact(evidence.missingPhoneFactorCount, 0, 'Admin MFA missing phone factors');
  requireExact(evidence.recoveryQuorumReady, true, 'Admin MFA recovery quorum');
  requireExact(evidence.recoveryApproverEmailUnverifiedCount, 0, 'Admin MFA unverified recovery approver emails');
  requireExact(evidence.recoveryApproverMissingPhoneFactorCount, 0, 'Admin MFA recovery approver phone factors');
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
  if (Number(evidence.activeAdminCount || 0) <= 0) {
    failures.push('Admin MFA evidence activeAdminCount must be greater than zero.');
  }
  if (evidence.phoneMfaEnrolledCount !== evidence.activeAdminCount) {
    failures.push('Admin MFA evidence enrolled count must equal active Admin count.');
  }
  if (Number(evidence.recoveryApproverCandidateCount || 0) < 2) {
    failures.push('Admin MFA evidence requires at least two recovery approver candidates.');
  }
  if (Number(evidence.recoveryApproverMfaReadyCount || 0) < 2) {
    failures.push('Admin MFA evidence requires at least two MFA-ready recovery approvers.');
  }
  if (Number(evidence.recoveryApproverMfaReadyCount || 0) > Number(evidence.recoveryApproverCandidateCount || 0)) {
    failures.push('Admin MFA evidence recovery ready count cannot exceed candidate count.');
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
    '[admin-mfa] production coverage passed '
      + `active=${result.summary.activeAdminCount} `
      + `phone_mfa=${result.summary.phoneMfaEnrolledCount} `
      + `recovery_ready=${result.summary.recoveryApproverMfaReadyCount} `
      + `disabled=${result.summary.disabledAdminCount} `
      + `inactive_profiles=${result.summary.inactiveProfileAdminCount}`,
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

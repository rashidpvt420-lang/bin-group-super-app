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

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();

function roleOfClaims(claims = {}) {
  return lower(claims.role || claims.userRole || claims.primaryRole);
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

function enrolledFactors(user) {
  return Array.isArray(user?.multiFactor?.enrolledFactors)
    ? user.multiFactor.enrolledFactors
    : [];
}

export function summarizeAdminMfaUsers(users) {
  const source = Array.isArray(users) ? users : [];
  let claimedAdminCount = 0;
  let disabledAdminCount = 0;
  let activeAdminCount = 0;
  let phoneMfaEnrolledCount = 0;
  let missingPhoneFactorCount = 0;
  let unsupportedOnlyFactorCount = 0;

  for (const user of source) {
    if (!claimsGrantAdminPortal(user?.customClaims || {})) continue;
    claimedAdminCount += 1;
    if (user?.disabled === true) {
      disabledAdminCount += 1;
      continue;
    }
    activeAdminCount += 1;
    const factors = enrolledFactors(user);
    const phoneFactors = factors.filter((factor) => lower(factor?.factorId) === 'phone');
    if (phoneFactors.length > 0) {
      phoneMfaEnrolledCount += 1;
    } else {
      missingPhoneFactorCount += 1;
      if (factors.length > 0) unsupportedOnlyFactorCount += 1;
    }
  }

  const failures = [];
  if (activeAdminCount === 0) {
    failures.push('No active Firebase Auth account with approved Admin/staff claims was found.');
  }
  if (missingPhoneFactorCount > 0) {
    failures.push(`${missingPhoneFactorCount} active Admin/staff account(s) have no enrolled phone MFA factor.`);
  }

  return {
    ok: failures.length === 0,
    failures,
    summary: {
      claimedAdminCount,
      disabledAdminCount,
      activeAdminCount,
      phoneMfaEnrolledCount,
      missingPhoneFactorCount,
      unsupportedOnlyFactorCount,
      allActiveAdminsPhoneMfaReady:
        activeAdminCount > 0 && phoneMfaEnrolledCount === activeAdminCount,
    },
  };
}

export function buildAdminMfaEvidence(summary, {
  env = process.env,
  now = new Date(),
} = {}) {
  return {
    schemaVersion: 1,
    status: 'passed',
    source: 'firebase-admin-auth-list-users',
    projectId: EXPECTED_PROJECT_ID,
    commitSha: text(env.GITHUB_SHA) || null,
    repository: text(env.GITHUB_REPOSITORY) || null,
    ref: text(env.GITHUB_REF) || null,
    workflowRunId: text(env.GITHUB_RUN_ID) || null,
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT || 0) || null,
    verifiedAt: now.toISOString(),
    claimedAdminCount: Number(summary?.claimedAdminCount || 0),
    disabledAdminCount: Number(summary?.disabledAdminCount || 0),
    activeAdminCount: Number(summary?.activeAdminCount || 0),
    phoneMfaEnrolledCount: Number(summary?.phoneMfaEnrolledCount || 0),
    missingPhoneFactorCount: Number(summary?.missingPhoneFactorCount || 0),
    unsupportedOnlyFactorCount: Number(summary?.unsupportedOnlyFactorCount || 0),
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
  requireExact(evidence.schemaVersion, 1, 'Admin MFA evidence schemaVersion');
  requireExact(evidence.status, 'passed', 'Admin MFA evidence status');
  requireExact(evidence.source, 'firebase-admin-auth-list-users', 'Admin MFA evidence source');
  requireExact(evidence.projectId, EXPECTED_PROJECT_ID, 'Admin MFA evidence projectId');
  requireExact(evidence.commitSha, commitSha, 'Admin MFA evidence commitSha');
  requireExact(evidence.repository, repository, 'Admin MFA evidence repository');
  requireExact(evidence.ref, ref, 'Admin MFA evidence ref');
  requireExact(evidence.workflowRunId, workflowRunId, 'Admin MFA evidence workflowRunId');
  requireExact(evidence.workflowRunAttempt, workflowRunAttempt, 'Admin MFA evidence workflowRunAttempt');
  requireExact(evidence.allActiveAdminsPhoneMfaReady, true, 'Admin MFA all-active coverage');
  requireExact(evidence.missingPhoneFactorCount, 0, 'Admin MFA missing phone factors');
  requireExact(evidence.sensitiveValuesExcluded, true, 'Admin MFA sensitiveValuesExcluded');
  requireExact(evidence.hardLaunchClaim, false, 'Admin MFA hardLaunchClaim');

  for (const key of [
    'claimedAdminCount',
    'disabledAdminCount',
    'activeAdminCount',
    'phoneMfaEnrolledCount',
    'missingPhoneFactorCount',
    'unsupportedOnlyFactorCount',
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

export async function verifyAdminMfaProduction({
  projectId = resolveFirebaseAdminProjectId(),
  authClient,
  env = process.env,
  now = new Date(),
} = {}) {
  if (text(projectId) !== EXPECTED_PROJECT_ID) {
    throw new Error(`GCP_PROJECT_ID must equal ${EXPECTED_PROJECT_ID}.`);
  }
  initializeFirebaseAdmin(admin, projectId);
  const users = await fetchAllAuthUsers({ authClient });
  const result = summarizeAdminMfaUsers(users);
  if (!result.ok) {
    throw new Error(`Admin MFA production coverage is not launch-safe: ${result.failures.join('; ')}`);
  }
  const evidence = buildAdminMfaEvidence(result.summary, { env, now });
  console.log(
    '[admin-mfa] production coverage passed '
      + `active=${result.summary.activeAdminCount} `
      + `phone_mfa=${result.summary.phoneMfaEnrolledCount} `
      + `disabled=${result.summary.disabledAdminCount}`,
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

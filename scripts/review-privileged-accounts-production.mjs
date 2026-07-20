#!/usr/bin/env node

import admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import {
  CANONICAL_FOUNDER_EMAIL,
  attachAdminProfiles,
  claimsGrantAdminPortal,
  fetchAllAuthUsers,
  isCanonicalFounderAccount,
} from './verify-admin-mfa-production.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EVIDENCE_PATH = 'launch_package/privileged-account-cleanup.json';
const INACTIVE_PROFILE_STATUSES = new Set(['suspended', 'disabled', 'rejected', 'inactive']);

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const sha256 = (value) => createHash('sha256').update(String(value ?? '')).digest('hex');

function phoneMfaReady(user) {
  return (user?.multiFactor?.enrolledFactors || [])
    .some((factor) => lower(factor?.factorId) === 'phone');
}

function profileActive(user) {
  if (user?.profileExists !== true) return false;
  const profile = user.profile || {};
  if (profile.suspended === true) return false;
  return !INACTIVE_PROFILE_STATUSES.has(lower(profile.status));
}

export function summarizePrivilegedAccountReview(privilegedUsers) {
  const privileged = Array.isArray(privilegedUsers) ? privilegedUsers : [];
  const canonical = privileged.filter((user) => isCanonicalFounderAccount(user));
  const targets = privileged.filter((user) => !isCanonicalFounderAccount(user));
  const founder = canonical.length === 1 ? canonical[0] : null;
  const founderAccountEnabled = Boolean(founder && founder.disabled !== true);
  const founderProfileActive = Boolean(founder && profileActive(founder));
  const founderEmailVerified = Boolean(founder && founder.emailVerified === true);
  const founderPhoneMfaReady = Boolean(founder && phoneMfaReady(founder));
  const blockers = [];

  if (canonical.length !== 1) {
    blockers.push(`exactly one ${CANONICAL_FOUNDER_EMAIL} CEO/Super Admin account is required; found ${canonical.length}`);
  }
  if (founder && !founderAccountEnabled) blockers.push('canonical founder Firebase Auth account is disabled');
  if (founder && !founderProfileActive) blockers.push('canonical founder Firestore profile is missing or inactive');
  if (founder && !founderEmailVerified) blockers.push('canonical founder email is not verified');
  if (founder && !founderPhoneMfaReady) blockers.push('canonical founder phone MFA factor is not enrolled');
  if (targets.length > 0) blockers.push(`${targets.length} unexpected privileged account(s) must be deleted`);

  return {
    canonicalFounderCount: canonical.length,
    canonicalFounderReady:
      canonical.length === 1 &&
      founderAccountEnabled &&
      founderProfileActive &&
      founderEmailVerified &&
      founderPhoneMfaReady,
    founderAccountEnabled,
    founderProfileActive,
    founderEmailVerified,
    founderPhoneMfaReady,
    executionEligible:
      canonical.length === 1 &&
      founderAccountEnabled &&
      founderProfileActive &&
      founderEmailVerified &&
      founderPhoneMfaReady,
    executionBlockers: blockers,
    privilegedAccountCountBefore: privileged.length,
    deletionTargetCount: targets.length,
    targetIdentityHashes: targets
      .map((target) => sha256(`${target.uid}|${lower(target.email)}`))
      .sort(),
  };
}

export async function reviewPrivilegedAccountsProduction({
  projectId = resolveFirebaseAdminProjectId(),
  env = process.env,
  now = new Date(),
  authClient,
  firestoreClient,
} = {}) {
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`GCP_PROJECT_ID must equal ${EXPECTED_PROJECT_ID}.`);
  }

  initializeFirebaseAdmin(admin, projectId);
  const auth = authClient || admin.auth();
  const db = firestoreClient || admin.firestore();
  const users = await fetchAllAuthUsers({ authClient: auth });
  const enriched = await attachAdminProfiles(users, { firestoreClient: db });
  const privileged = enriched.filter((user) => claimsGrantAdminPortal(user?.customClaims || {}));
  const summary = summarizePrivilegedAccountReview(privileged);
  const result = {
    schemaVersion: 2,
    status: 'dry-run',
    projectId,
    repository: text(env.GITHUB_REPOSITORY) || null,
    ref: text(env.GITHUB_REF) || null,
    commitSha: text(env.GITHUB_SHA) || null,
    workflowRunId: text(env.GITHUB_RUN_ID) || null,
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT || 0) || null,
    verifiedAt: now.toISOString(),
    ...summary,
    deletedAccountCount: 0,
    deletedProfileDocumentCount: 0,
    sensitiveValuesExcluded: true,
    auditLogsPreserved: true,
    nonPrivilegedAccountsUntouched: true,
    mutationPerformed: false,
    hardLaunchClaim: false,
  };

  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `[privileged-review] targets=${result.deletionTargetCount} canonical_founder_ready=${result.canonicalFounderReady} mutation_performed=false`,
  );
  return result;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  reviewPrivilegedAccountsProduction().catch((error) => {
    const message = error instanceof Error ? error.message : 'Privileged account review failed.';
    console.error(`[privileged-review] FAILED: ${message}`);
    process.exit(1);
  });
}

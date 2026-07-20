#!/usr/bin/env node

import admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import {
  CANONICAL_FOUNDER_EMAIL,
  attachAdminProfiles,
  claimsGrantAdminPortal,
  fetchAllAuthUsers,
  isCanonicalFounderAccount,
} from './verify-admin-mfa-production.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXECUTION_CONFIRMATION = 'DELETE_ALL_OTHER_PRIVILEGED_ACCOUNTS_BIN_GROUP';
const EVIDENCE_PATH = 'launch_package/privileged-account-cleanup.json';
const DIRECT_PROFILE_COLLECTIONS = [
  'users',
  'staffAccess',
  'hrProfiles',
  'staff',
  'technicians',
];
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

export function canonicalFounderExecutionReadiness(canonicalUsers) {
  const canonical = Array.isArray(canonicalUsers) ? canonicalUsers : [];
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

  return {
    founder,
    canonicalFounderCount: canonical.length,
    canonicalFounderReady: blockers.length === 0,
    founderAccountEnabled,
    founderProfileActive,
    founderEmailVerified,
    founderPhoneMfaReady,
    blockers,
  };
}

function requireProtectedExecutionContext({ execute, projectId, env = process.env }) {
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`GCP_PROJECT_ID must equal ${EXPECTED_PROJECT_ID}.`);
  }
  if (!execute) return;
  if (env.GITHUB_ACTIONS !== 'true') {
    throw new Error('Destructive privileged-account cleanup is allowed only in GitHub Actions.');
  }
  if (env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Destructive privileged-account cleanup requires refs/heads/main.');
  }
  if (text(env.DEPLOYMENT_ENVIRONMENT) !== 'production') {
    throw new Error('DEPLOYMENT_ENVIRONMENT must equal production.');
  }
  if (text(env.PRIVILEGED_ACCOUNT_CLEANUP_CONFIRMATION) !== EXECUTION_CONFIRMATION) {
    throw new Error('Exact privileged-account cleanup confirmation is required.');
  }
  if (lower(env.CANONICAL_FOUNDER_EMAIL_CONFIRMATION) !== CANONICAL_FOUNDER_EMAIL) {
    throw new Error(`Canonical founder confirmation must equal ${CANONICAL_FOUNDER_EMAIL}.`);
  }
  if (!/^[0-9a-f]{40}$/.test(text(env.GITHUB_SHA))) {
    throw new Error('A valid exact main commit SHA is required.');
  }
}

async function deleteQuery(db, collectionName, field, uid) {
  const snapshot = await db.collection(collectionName).where(field, '==', uid).limit(500).get();
  if (snapshot.empty) return 0;
  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
  return snapshot.size;
}

async function purgePrivilegedTarget({ auth, db, target, actor }) {
  const uid = target.uid;
  const emailHash = sha256(lower(target.email));

  await auth.updateUser(uid, { disabled: true });
  await auth.revokeRefreshTokens(uid);

  let deletedDocuments = 0;
  const batch = db.batch();
  for (const collectionName of DIRECT_PROFILE_COLLECTIONS) {
    batch.delete(db.collection(collectionName).doc(uid));
    deletedDocuments += 1;
  }
  await batch.commit();

  deletedDocuments += await deleteQuery(db, 'admin_security_sessions', 'adminUid', uid);
  deletedDocuments += await deleteQuery(db, 'notifications', 'userId', uid);

  await db.collection('audit_logs').add({
    action: 'OBSOLETE_PRIVILEGED_ACCOUNT_DELETED',
    actorId: actor,
    actorRole: 'protected-production-workflow',
    targetType: 'firebase_auth_user',
    targetIdHash: sha256(uid),
    targetEmailHash: emailHash,
    deletedProfileDocumentCount: deletedDocuments,
    canonicalFounderRetained: true,
    sensitiveValuesExcluded: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await auth.deleteUser(uid);
  return { uidHash: sha256(uid), emailHash, deletedDocuments };
}

export async function deleteObsoletePrivilegedAccountsProduction({
  execute = false,
  projectId = resolveFirebaseAdminProjectId(),
  env = process.env,
  now = new Date(),
  authClient,
  firestoreClient,
} = {}) {
  requireProtectedExecutionContext({ execute, projectId, env });
  initializeFirebaseAdmin(admin, projectId);
  const auth = authClient || admin.auth();
  const db = firestoreClient || admin.firestore();

  const users = await fetchAllAuthUsers({ authClient: auth });
  const enriched = await attachAdminProfiles(users, { firestoreClient: db });
  const privileged = enriched.filter((user) => claimsGrantAdminPortal(user?.customClaims || {}));
  const canonical = privileged.filter((user) => isCanonicalFounderAccount(user));
  const targets = privileged.filter((user) => !isCanonicalFounderAccount(user));
  const readiness = canonicalFounderExecutionReadiness(canonical);

  const result = {
    schemaVersion: 2,
    status: execute ? 'executed' : 'dry-run',
    projectId,
    repository: text(env.GITHUB_REPOSITORY) || null,
    ref: text(env.GITHUB_REF) || null,
    commitSha: text(env.GITHUB_SHA) || null,
    workflowRunId: text(env.GITHUB_RUN_ID) || null,
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT || 0) || null,
    verifiedAt: now.toISOString(),
    canonicalFounderCount: readiness.canonicalFounderCount,
    canonicalFounderReady: readiness.canonicalFounderReady,
    founderAccountEnabled: readiness.founderAccountEnabled,
    founderProfileActive: readiness.founderProfileActive,
    founderEmailVerified: readiness.founderEmailVerified,
    founderPhoneMfaReady: readiness.founderPhoneMfaReady,
    executionEligible: readiness.canonicalFounderReady,
    executionBlockers: readiness.blockers,
    privilegedAccountCountBefore: privileged.length,
    deletionTargetCount: targets.length,
    deletedAccountCount: 0,
    deletedProfileDocumentCount: 0,
    targetIdentityHashes: targets.map((target) => sha256(`${target.uid}|${lower(target.email)}`)).sort(),
    sensitiveValuesExcluded: true,
    auditLogsPreserved: true,
    nonPrivilegedAccountsUntouched: true,
    hardLaunchClaim: false,
  };

  if (execute && !readiness.canonicalFounderReady) {
    mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    writeFileSync(EVIDENCE_PATH, `${JSON.stringify(result, null, 2)}\n`);
    throw new Error(`Cleanup refused: ${readiness.blockers.join('; ')}.`);
  }

  if (execute) {
    for (const target of targets) {
      const deleted = await purgePrivilegedTarget({
        auth,
        db,
        target,
        actor: text(env.GITHUB_ACTOR) || 'protected-production-workflow',
      });
      result.deletedAccountCount += 1;
      result.deletedProfileDocumentCount += deleted.deletedDocuments;
    }

    const remainingUsers = await fetchAllAuthUsers({ authClient: auth });
    const remainingPrivileged = remainingUsers.filter((user) => claimsGrantAdminPortal(user?.customClaims || {}));
    if (remainingPrivileged.length !== 1 || !isCanonicalFounderAccount(remainingPrivileged[0])) {
      throw new Error('Cleanup completed incompletely: production does not contain exactly one canonical privileged account.');
    }
  }

  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `[privileged-cleanup] ${result.status} targets=${result.deletionTargetCount} deleted=${result.deletedAccountCount} canonical_founder_ready=${result.canonicalFounderReady}`,
  );
  return result;
}

const execute = process.argv.includes('--execute');
deleteObsoletePrivilegedAccountsProduction({ execute }).catch((error) => {
  const message = error instanceof Error ? error.message : 'Privileged account cleanup failed.';
  console.error(`[privileged-cleanup] REFUSED: ${message}`);
  process.exit(1);
});

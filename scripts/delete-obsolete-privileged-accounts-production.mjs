#!/usr/bin/env node

import admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { retireConfiguredE2eAdmin } from './e2e-admin-lifecycle.mjs';
import {
  CANONICAL_FOUNDER_EMAIL,
  attachAdminProfiles,
  claimsGrantAdminPortal,
  fetchAllAuthUsers,
  isCanonicalFounderAccount,
} from './verify-admin-mfa-production.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXECUTION_CONFIRMATION = 'DELETE_ALL_OTHER_PRIVILEGED_ACCOUNTS_BIN_GROUP';
const DEPLOY_WORKFLOW_NAME = 'Firebase Production Deploy';
const OWNER_CLEANUP_WORKFLOW_NAME = 'Privileged Account Cleanup - Production';
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

function resolveExecutionMode({ execute, env = process.env }) {
  if (!execute) return 'dry-run';
  const workflowName = text(env.GITHUB_WORKFLOW);
  if (workflowName === DEPLOY_WORKFLOW_NAME) return 'deploy-preflight';
  if (workflowName === OWNER_CLEANUP_WORKFLOW_NAME) return 'owner-cleanup';
  throw new Error(
    `Destructive privileged-account cleanup is restricted to ${OWNER_CLEANUP_WORKFLOW_NAME}.`,
  );
}

function requireProtectedExecutionContext({ execute, projectId, env = process.env }) {
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`GCP_PROJECT_ID must equal ${EXPECTED_PROJECT_ID}.`);
  }

  const executionMode = resolveExecutionMode({ execute, env });
  if (executionMode === 'dry-run') return executionMode;

  if (env.GITHUB_ACTIONS !== 'true') {
    throw new Error('Privileged-account production checks are allowed only in GitHub Actions.');
  }
  if (env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Privileged-account production checks require refs/heads/main.');
  }
  if (text(env.DEPLOYMENT_ENVIRONMENT) !== 'production') {
    throw new Error('DEPLOYMENT_ENVIRONMENT must equal production.');
  }
  if (!/^[0-9a-f]{40}$/.test(text(env.GITHUB_SHA))) {
    throw new Error('A valid exact main commit SHA is required.');
  }

  if (executionMode === 'owner-cleanup') {
    if (text(env.PRIVILEGED_ACCOUNT_CLEANUP_CONFIRMATION) !== EXECUTION_CONFIRMATION) {
      throw new Error('Exact privileged-account cleanup confirmation is required.');
    }
    if (lower(env.CANONICAL_FOUNDER_EMAIL_CONFIRMATION) !== CANONICAL_FOUNDER_EMAIL) {
      throw new Error(`Canonical founder confirmation must equal ${CANONICAL_FOUNDER_EMAIL}.`);
    }
  }

  return executionMode;
}

function writeEvidence(result) {
  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(result, null, 2)}\n`);
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
  const executionMode = requireProtectedExecutionContext({ execute, projectId, env });
  initializeFirebaseAdmin(admin, projectId);
  const auth = authClient || admin.auth();
  const db = firestoreClient || admin.firestore();

  let ephemeralE2eAdminRetirement = null;
  if (executionMode === 'deploy-preflight') {
    ephemeralE2eAdminRetirement = await retireConfiguredE2eAdmin({
      projectId,
      phase: 'predeploy',
      env,
      now,
      authClient: auth,
      firestoreClient: db,
    });
  }

  const users = await fetchAllAuthUsers({ authClient: auth });
  const enriched = await attachAdminProfiles(users, { firestoreClient: db });
  const privileged = enriched.filter((user) => claimsGrantAdminPortal(user?.customClaims || {}));
  const canonical = privileged.filter((user) => isCanonicalFounderAccount(user));
  const targets = privileged.filter((user) => !isCanonicalFounderAccount(user));

  if (canonical.length !== 1) {
    throw new Error(`Cleanup refused: exactly one ${CANONICAL_FOUNDER_EMAIL} CEO/Super Admin account is required; found ${canonical.length}.`);
  }
  const founder = canonical[0];
  if (founder.disabled === true || !profileActive(founder)) {
    throw new Error('Cleanup refused: the canonical founder account must be active with an active Firestore profile.');
  }
  if (founder.emailVerified !== true) {
    throw new Error('Cleanup refused: the canonical founder email is not verified.');
  }
  if (!phoneMfaReady(founder)) {
    throw new Error('Cleanup refused: the canonical founder phone MFA factor is not enrolled.');
  }

  const result = {
    schemaVersion: executionMode === 'owner-cleanup' ? 1 : 2,
    status: executionMode === 'owner-cleanup'
      ? 'executed'
      : executionMode === 'deploy-preflight'
        ? 'deploy-preflight'
        : 'dry-run',
    executionMode,
    projectId,
    repository: text(env.GITHUB_REPOSITORY) || null,
    ref: text(env.GITHUB_REF) || null,
    commitSha: text(env.GITHUB_SHA) || null,
    workflowRunId: text(env.GITHUB_RUN_ID) || null,
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT || 0) || null,
    verifiedAt: now.toISOString(),
    canonicalFounderCount: canonical.length,
    canonicalFounderReady: true,
    privilegedAccountCountBefore: privileged.length,
    deletionTargetCount: targets.length,
    deletedAccountCount: 0,
    deletedProfileDocumentCount: 0,
    targetIdentityHashes: targets.map((target) => sha256(`${target.uid}|${lower(target.email)}`)).sort(),
    requiresOwnerCleanup: executionMode === 'deploy-preflight' && targets.length > 0,
    ephemeralE2eAdminRetirementStatus: ephemeralE2eAdminRetirement?.status || null,
    ephemeralE2eAdminDeletedAccountCount: ephemeralE2eAdminRetirement?.deletedAccountCount || 0,
    ephemeralE2eAdminMutationPerformed: ephemeralE2eAdminRetirement?.mutationPerformed === true,
    ephemeralE2eAdminTargetIdentityHash: ephemeralE2eAdminRetirement?.targetIdentityHash || null,
    sensitiveValuesExcluded: true,
    auditLogsPreserved: true,
    nonPrivilegedAccountsUntouched: true,
    mutationPerformed: false,
    hardLaunchClaim: false,
  };

  if (executionMode === 'deploy-preflight') {
    writeEvidence(result);
    if (targets.length > 0) {
      throw new Error(
        `Deployment blocked: ${targets.length} unexpected privileged account(s) require the owner-authorized /bin-launch execute-privileged-cleanup workflow. No unexpected privileged identity was modified.`,
      );
    }
    console.log(
      `[privileged-cleanup] deploy-preflight targets=0 deleted=0 ephemeral_e2e_admin_deleted=${result.ephemeralE2eAdminDeletedAccountCount} mutation_performed=false`,
    );
    return result;
  }

  if (executionMode === 'owner-cleanup') {
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
    result.mutationPerformed = result.deletedAccountCount > 0;
  }

  writeEvidence(result);
  console.log(
    `[privileged-cleanup] ${result.status} targets=${result.deletionTargetCount} deleted=${result.deletedAccountCount} canonical_founder_ready=true mutation_performed=${result.mutationPerformed}`,
  );
  return result;
}

const execute = process.argv.includes('--execute');
deleteObsoletePrivilegedAccountsProduction({ execute }).catch((error) => {
  const message = error instanceof Error ? error.message : 'Privileged account cleanup failed.';
  console.error(`[privileged-cleanup] REFUSED: ${message}`);
  process.exit(1);
});

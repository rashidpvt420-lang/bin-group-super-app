#!/usr/bin/env node

import admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import {
  CANONICAL_FOUNDER_EMAIL,
  claimsGrantAdminPortal,
} from './verify-admin-mfa-production.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const DEPLOY_WORKFLOW_NAME = 'Firebase Production Deploy';
const ALLOWED_PHASES = new Set([
  'predeploy',
  'post-business-evidence',
  'post-launch-audit',
]);
const DIRECT_PROFILE_COLLECTIONS = [
  'users',
  'staffAccess',
  'hrProfiles',
  'staff',
  'technicians',
];

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const sha256 = (value) => createHash('sha256').update(String(value ?? '')).digest('hex');

function argValue(name) {
  const exact = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3).trim();
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? text(process.argv[index + 1]) : '';
}

function evidencePath(phase) {
  return `launch_package/e2e-admin-lifecycle-${phase}.json`;
}

function writeEvidence(result) {
  const output = evidencePath(result.phase);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
}

export function shouldManageEphemeralE2eAdmin(env = process.env) {
  return env.GITHUB_ACTIONS === 'true' &&
    text(env.GITHUB_WORKFLOW) === DEPLOY_WORKFLOW_NAME &&
    text(env.DEPLOYMENT_ENVIRONMENT) === 'production' &&
    text(env.E2E_ADMIN_EMAIL).length > 0;
}

function requireProtectedContext({ projectId, phase, env }) {
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`GCP_PROJECT_ID must equal ${EXPECTED_PROJECT_ID}.`);
  }
  if (!ALLOWED_PHASES.has(phase)) {
    throw new Error(`Unsupported E2E Admin lifecycle phase: ${phase || '(blank)'}.`);
  }
  if (!shouldManageEphemeralE2eAdmin(env)) {
    throw new Error('E2E Admin lifecycle changes require the protected Firebase Production Deploy workflow.');
  }
  if (env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('E2E Admin lifecycle changes require refs/heads/main.');
  }
  if (!/^[0-9a-f]{40}$/.test(text(env.GITHUB_SHA))) {
    throw new Error('E2E Admin lifecycle changes require an exact lowercase main commit SHA.');
  }

  const configuredEmail = lower(env.E2E_ADMIN_EMAIL);
  if (!configuredEmail || !configuredEmail.includes('@')) {
    throw new Error('E2E_ADMIN_EMAIL must be a valid configured email address.');
  }
  if (configuredEmail === CANONICAL_FOUNDER_EMAIL) {
    throw new Error('E2E_ADMIN_EMAIL must never equal the canonical Founder email.');
  }
  return configuredEmail;
}

export function validateEphemeralE2eAdminIdentity({ authUser, profile, configuredEmail }) {
  const expectedEmail = lower(configuredEmail);
  const authEmail = lower(authUser?.email);
  const profileEmail = lower(profile?.email);
  const claims = authUser?.customClaims || {};

  if (!authUser?.uid || authEmail !== expectedEmail) {
    throw new Error('Configured E2E Admin Auth identity does not match E2E_ADMIN_EMAIL.');
  }
  if (expectedEmail === CANONICAL_FOUNDER_EMAIL) {
    throw new Error('Canonical Founder protection refused the E2E Admin lifecycle operation.');
  }
  if (claims.testAccount !== true || lower(claims.role) !== 'admin' || claims.admin !== true) {
    throw new Error('Configured E2E Admin lacks the exact testAccount/admin Auth markers.');
  }
  if (!claimsGrantAdminPortal(claims)) {
    throw new Error('Configured E2E Admin does not currently grant the Admin portal.');
  }
  if (!profile || profile.testAccount !== true || lower(profile.role) !== 'admin') {
    throw new Error('Configured E2E Admin lacks the exact Firestore testAccount/admin markers.');
  }
  if (profileEmail !== expectedEmail || text(profile.uid) !== text(authUser.uid)) {
    throw new Error('Configured E2E Admin Firestore profile does not match the Auth identity.');
  }

  return {
    uid: text(authUser.uid),
    email: expectedEmail,
    identityHash: sha256(`${text(authUser.uid)}|${expectedEmail}`),
  };
}

async function deleteMatchingQuery(db, collectionName, field, uid) {
  const snapshot = await db.collection(collectionName).where(field, '==', uid).limit(500).get();
  if (snapshot.empty) return 0;
  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
  return snapshot.size;
}

async function deleteDirectProfiles(db, uid) {
  const refs = DIRECT_PROFILE_COLLECTIONS.map((collectionName) => db.collection(collectionName).doc(uid));
  const snapshots = await Promise.all(refs.map((ref) => ref.get()));
  const existing = snapshots.filter((snapshot) => snapshot.exists).length;
  const batch = db.batch();
  refs.forEach((ref) => batch.delete(ref));
  await batch.commit();
  return existing;
}

export async function retireConfiguredE2eAdmin({
  projectId = resolveFirebaseAdminProjectId(),
  phase,
  env = process.env,
  now = new Date(),
  authClient,
  firestoreClient,
} = {}) {
  const configuredEmail = requireProtectedContext({ projectId, phase, env });
  initializeFirebaseAdmin(admin, projectId);
  const auth = authClient || admin.auth();
  const db = firestoreClient || admin.firestore();

  const baseResult = {
    schemaVersion: 1,
    status: 'absent',
    phase,
    projectId,
    repository: text(env.GITHUB_REPOSITORY) || null,
    ref: text(env.GITHUB_REF) || null,
    commitSha: text(env.GITHUB_SHA) || null,
    workflowRunId: text(env.GITHUB_RUN_ID) || null,
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT || 0) || null,
    verifiedAt: now.toISOString(),
    configuredIdentityHash: sha256(configuredEmail),
    deletedAccountCount: 0,
    deletedProfileDocumentCount: 0,
    mutationPerformed: false,
    canonicalFounderProtected: true,
    sensitiveValuesExcluded: true,
    auditLogWritten: false,
    hardLaunchClaim: false,
  };

  let authUser;
  try {
    authUser = await auth.getUserByEmail(configuredEmail);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      writeEvidence(baseResult);
      console.log(`[e2e-admin-lifecycle] phase=${phase} status=absent deleted=0`);
      return baseResult;
    }
    throw error;
  }

  const profileSnapshot = await db.collection('users').doc(authUser.uid).get();
  const profile = profileSnapshot.exists ? profileSnapshot.data() : null;
  const identity = validateEphemeralE2eAdminIdentity({
    authUser,
    profile,
    configuredEmail,
  });

  await auth.updateUser(identity.uid, { disabled: true });
  await auth.revokeRefreshTokens(identity.uid);

  let deletedProfileDocumentCount = await deleteDirectProfiles(db, identity.uid);
  deletedProfileDocumentCount += await deleteMatchingQuery(db, 'admin_security_sessions', 'adminUid', identity.uid);
  deletedProfileDocumentCount += await deleteMatchingQuery(db, 'notifications', 'userId', identity.uid);

  await db.collection('audit_logs').add({
    action: 'EPHEMERAL_E2E_ADMIN_RETIRED',
    actorId: text(env.GITHUB_ACTOR) || 'protected-production-workflow',
    actorRole: 'protected-production-workflow',
    lifecyclePhase: phase,
    targetType: 'firebase_auth_test_user',
    targetIdentityHash: identity.identityHash,
    deletedProfileDocumentCount,
    canonicalFounderProtected: true,
    sensitiveValuesExcluded: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await auth.deleteUser(identity.uid);

  const result = {
    ...baseResult,
    status: 'deleted',
    targetIdentityHash: identity.identityHash,
    deletedAccountCount: 1,
    deletedProfileDocumentCount,
    mutationPerformed: true,
    auditLogWritten: true,
  };
  writeEvidence(result);
  console.log(`[e2e-admin-lifecycle] phase=${phase} status=deleted deleted=1 profiles=${deletedProfileDocumentCount}`);
  return result;
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (invokedPath) {
  const phase = argValue('phase');
  retireConfiguredE2eAdmin({ phase }).catch((error) => {
    const message = error instanceof Error ? error.message : 'E2E Admin lifecycle operation failed.';
    console.error(`[e2e-admin-lifecycle] REFUSED: ${message}`);
    process.exit(1);
  });
}

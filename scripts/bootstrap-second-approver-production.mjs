#!/usr/bin/env node
// Owner-confirmed, one-identity bootstrap for the named second approver (Rashid, 18 Nov 2026).
//
// Creates or promotes exactly the account named by the protected SECOND_APPROVER_EMAIL secret into a
// Super Admin carrying the Admin-SDK-only designatedSecondApprover claim. That account may request and
// approve Finance grants and do other Super Admin non-money work; it never carries a Finance role, a
// Finance flag or financeAuthorizedAt, and every money path refuses the claim. Readiness accepts it as a
// third privileged account only after it has a verified email, MFA and an active profile.
//
// Runs only from the "Second Approver Bootstrap - Production" workflow on exact main in the production
// environment, with typed confirmations. It is bound forever to the first named identity: a later run
// for a different email is refused. It prints and records no email, uid, password or link.

import admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import {
  CANONICAL_FOUNDER_EMAIL,
  FINANCE_TIER_APPROVER_ROLES,
  SECOND_APPROVER_CLAIM,
  SECOND_APPROVER_EMAIL_ENV,
  attachAdminProfiles,
  fetchAllAuthUsers,
  isCanonicalFounderAccount,
  secondApproverConfigFailures,
} from './verify-admin-mfa-production.mjs';

export const SECOND_APPROVER_WORKFLOW_NAME = 'Second Approver Bootstrap - Production';
export const SECOND_APPROVER_CONFIRMATION = 'PROVISION_NAMED_SECOND_APPROVER_BIN_GROUP';
export const SECOND_APPROVER_MARKER_PATH = ['system_secrets', 'second_approver_bootstrap'];
const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EVIDENCE_PATH = 'launch_package/second-approver-bootstrap.json';
const INACTIVE_PROFILE_STATUSES = new Set(['suspended', 'disabled', 'rejected', 'inactive']);
// An existing account may only be promoted from no role, Admin, or a non-Finance Admin-portal staff role.
export const PROMOTABLE_ROLES = new Set([
  '',
  'admin',
  'super_admin',
  'manager',
  'operations_admin',
  'operations_manager',
  'hr_admin',
  'hr_manager',
  'hr_staff',
  'support_admin',
  'account_manager',
  'dispatcher',
  'admin_assistant',
]);
const MONEY_OR_PUBLIC_FLAGS = [
  'ceo',
  'technician',
  'testAccount',
  'finance_admin',
  'finance_manager',
  'finance_controller',
  'finance_staff',
  'payroll_admin',
];

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const sha256 = (value) => createHash('sha256').update(String(value ?? '')).digest('hex');

/** The exact claim set: Super Admin authority, no Finance, CEO or staff authority. */
export function secondApproverClaims() {
  return {
    role: 'super_admin',
    userRole: 'super_admin',
    primaryRole: 'super_admin',
    super_admin: true,
    superAdmin: true,
    admin: true,
    isAdmin: true,
    ceo: false,
    staff: false,
    isStaff: false,
    finance_admin: false,
    finance_manager: false,
    finance_controller: false,
    suspended: false,
    [SECOND_APPROVER_CLAIM]: true,
  };
}

export function requireSecondApproverExecutionContext({ projectId, env = process.env }) {
  if (projectId !== EXPECTED_PROJECT_ID) throw new Error(`GCP_PROJECT_ID must equal ${EXPECTED_PROJECT_ID}.`);
  if (env.GITHUB_ACTIONS !== 'true') throw new Error('Second approver bootstrap is allowed only in GitHub Actions.');
  if (text(env.GITHUB_WORKFLOW) !== SECOND_APPROVER_WORKFLOW_NAME) {
    throw new Error(`Second approver bootstrap is restricted to ${SECOND_APPROVER_WORKFLOW_NAME}.`);
  }
  if (env.GITHUB_REF !== 'refs/heads/main') throw new Error('Second approver bootstrap requires refs/heads/main.');
  if (text(env.DEPLOYMENT_ENVIRONMENT) !== 'production') throw new Error('DEPLOYMENT_ENVIRONMENT must equal production.');
  if (!/^[0-9a-f]{40}$/.test(text(env.GITHUB_SHA))) throw new Error('A valid exact main commit SHA is required.');
  if (text(env.SECOND_APPROVER_BOOTSTRAP_CONFIRMATION) !== SECOND_APPROVER_CONFIRMATION) {
    throw new Error('Exact second approver bootstrap confirmation is required.');
  }
  if (lower(env.CANONICAL_FOUNDER_EMAIL_CONFIRMATION) !== CANONICAL_FOUNDER_EMAIL) {
    throw new Error(`Canonical founder confirmation must equal ${CANONICAL_FOUNDER_EMAIL}.`);
  }
  const email = lower(env[SECOND_APPROVER_EMAIL_ENV]);
  if (!email) throw new Error('SECOND_APPROVER_EMAIL must name the second approver.');
  if (lower(env.SECOND_APPROVER_EMAIL_CONFIRMATION) !== email) {
    throw new Error('The typed second approver email confirmation does not match SECOND_APPROVER_EMAIL.');
  }
  const financeEmail = lower(env.E2E_FINANCE_APPROVER_EMAIL);
  if (!financeEmail) throw new Error('E2E_FINANCE_APPROVER_EMAIL must be configured so the second approver can be checked against it.');
  const failures = secondApproverConfigFailures(email, { expectedFinanceEmail: financeEmail });
  for (const key of ['E2E_FINANCE_RECORDER_EMAIL', 'E2E_ADMIN_EMAIL']) {
    if (lower(env[key]) && lower(env[key]) === email) failures.push(`SECOND_APPROVER_EMAIL must not equal ${key}.`);
  }
  if (failures.length) throw new Error(failures.join(' '));
  return { email, financeEmail };
}

function profileActive(user) {
  if (user?.profileExists !== true) return false;
  const profile = user.profile || {};
  return profile.suspended !== true && !INACTIVE_PROFILE_STATUSES.has(lower(profile.status));
}

/**
 * Pure decision: what the bootstrap may do for the named email, given every Auth user (privileged ones
 * enriched with profiles), the target's own profile, and the one-time marker. Throws on any refusal.
 */
export function planSecondApproverBootstrap({ users, email, targetProfile = null, marker = null }) {
  const all = Array.isArray(users) ? users : [];
  const named = lower(email);
  const founders = all.filter((user) => isCanonicalFounderAccount(user));
  if (founders.length !== 1) throw new Error(`Bootstrap refused: exactly one ${CANONICAL_FOUNDER_EMAIL} Founder account is required.`);
  const founder = founders[0];
  const founderPhone = (founder.multiFactor?.enrolledFactors || []).some((factor) => lower(factor?.factorId) === 'phone');
  if (founder.disabled === true || founder.emailVerified !== true || !founderPhone || !profileActive(founder)) {
    throw new Error('Bootstrap refused: the canonical Founder must be active, verified and phone-MFA enrolled.');
  }

  const emailHash = sha256(named);
  if (marker && marker.consumed === true && text(marker.targetEmailHash) !== emailHash) {
    throw new Error('Bootstrap refused: the second approver was already provisioned for a different identity. It is provisioned once.');
  }

  const target = all.find((user) => lower(user?.email) === named) || null;
  const otherDesignated = all.filter((user) => user?.customClaims?.[SECOND_APPROVER_CLAIM] === true && user !== target);
  if (otherDesignated.length > 0) {
    throw new Error('Bootstrap refused: another account already carries the second approver designation.');
  }

  if (!target) return { mode: 'create', target: null, emailHash };

  const claims = target.customClaims || {};
  const role = lower(claims.role || claims.userRole || claims.primaryRole);
  if (target.disabled === true) throw new Error('Bootstrap refused: the named account is disabled.');
  if (isCanonicalFounderAccount(target) || lower(target.email) === CANONICAL_FOUNDER_EMAIL) {
    throw new Error('Bootstrap refused: the named account is the Founder.');
  }
  if (FINANCE_TIER_APPROVER_ROLES.has(role) || role.startsWith('finance') || role === 'payroll_admin' || role === 'ceo') {
    throw new Error('Bootstrap refused: a Finance or CEO account can never become the second approver.');
  }
  if (MONEY_OR_PUBLIC_FLAGS.some((flag) => claims[flag] === true) || claims.financeAuthorizedAt) {
    throw new Error('Bootstrap refused: the named account carries Finance, CEO, technician or test authority.');
  }
  if (!PROMOTABLE_ROLES.has(role)) {
    throw new Error('Bootstrap refused: only an unassigned, Admin or non-Finance staff account can be promoted.');
  }
  const profileRole = lower(targetProfile?.role || targetProfile?.userRole || targetProfile?.primaryRole);
  if (!PROMOTABLE_ROLES.has(profileRole)) {
    throw new Error('Bootstrap refused: the named account profile belongs to a public or Finance role.');
  }
  const alreadyProvisioned = claims[SECOND_APPROVER_CLAIM] === true && role === 'super_admin' && claims.super_admin === true;
  return { mode: alreadyProvisioned ? 'already-provisioned' : 'promote', target, emailHash };
}

function writeEvidence(result) {
  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(result, null, 2)}\n`);
}

export async function bootstrapSecondApproverProduction({
  execute = false,
  projectId = resolveFirebaseAdminProjectId(),
  env = process.env,
  now = new Date(),
  authClient,
  firestoreClient,
} = {}) {
  const { email } = requireSecondApproverExecutionContext({ projectId, env });
  initializeFirebaseAdmin(admin, projectId);
  const auth = authClient || admin.auth();
  const db = firestoreClient || admin.firestore();

  const users = await attachAdminProfiles(await fetchAllAuthUsers({ authClient: auth }), { firestoreClient: db });
  const markerRef = db.collection(SECOND_APPROVER_MARKER_PATH[0]).doc(SECOND_APPROVER_MARKER_PATH[1]);
  const markerSnap = await markerRef.get();
  const existing = users.find((user) => lower(user?.email) === email) || null;
  const targetProfileSnap = existing ? await db.collection('users').doc(existing.uid).get() : null;
  const plan = planSecondApproverBootstrap({
    users,
    email,
    targetProfile: targetProfileSnap?.exists ? targetProfileSnap.data() : null,
    marker: markerSnap.exists ? markerSnap.data() : null,
  });

  const result = {
    schemaVersion: 1,
    status: execute ? 'executed' : 'dry-run',
    plannedMode: plan.mode,
    projectId,
    repository: text(env.GITHUB_REPOSITORY) || null,
    ref: text(env.GITHUB_REF) || null,
    commitSha: text(env.GITHUB_SHA) || null,
    workflowRunId: text(env.GITHUB_RUN_ID) || null,
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT || 0) || null,
    verifiedAt: now.toISOString(),
    targetEmailHash: plan.emailHash,
    financeMoneyAuthority: false,
    mfaEnrollmentRequiredBeforeReadiness: true,
    mutationPerformed: false,
    sensitiveValuesExcluded: true,
    hardLaunchClaim: false,
  };

  if (execute && plan.mode !== 'already-provisioned') {
    let uid = plan.target?.uid || '';
    if (plan.mode === 'create') {
      // No password and no link is generated or printed: the named person sets a password with the
      // Admin sign-in "Forgot password" email, verifies the email, then enrols MFA.
      const created = await auth.createUser({ email, emailVerified: false, disabled: false });
      uid = created.uid;
    }
    await auth.setCustomUserClaims(uid, secondApproverClaims());
    await auth.revokeRefreshTokens(uid);
    const serverNow = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('users').doc(uid).set({
      uid,
      email,
      role: 'super_admin',
      userRole: 'super_admin',
      primaryRole: 'super_admin',
      status: 'active',
      suspended: false,
      isStaff: false,
      staff: false,
      [SECOND_APPROVER_CLAIM]: true,
      financeMoneyAuthority: false,
      updatedAt: serverNow,
      ...(plan.mode === 'create' ? { createdAt: serverNow } : {}),
    }, { merge: true });
    await markerRef.set({
      consumed: true,
      targetEmailHash: plan.emailHash,
      targetIdHash: sha256(uid),
      mode: plan.mode,
      commitSha: result.commitSha,
      workflowRunId: result.workflowRunId,
      consumedAt: serverNow,
    }, { merge: true });
    await db.collection('audit_logs').add({
      action: 'NAMED_SECOND_APPROVER_PROVISIONED',
      actorId: text(env.GITHUB_ACTOR) || 'protected-production-workflow',
      actorRole: 'protected-production-workflow',
      targetType: 'firebase_auth_user',
      targetIdHash: sha256(uid),
      targetEmailHash: plan.emailHash,
      mode: plan.mode,
      role: 'super_admin',
      financeMoneyAuthority: false,
      commitSha: result.commitSha,
      workflowRunId: result.workflowRunId,
      sensitiveValuesExcluded: true,
      createdAt: serverNow,
    });
    result.mutationPerformed = true;
  }

  writeEvidence(result);
  console.log(`[second-approver] ${result.status} mode=${plan.mode} mutation_performed=${result.mutationPerformed} finance_money_authority=false`);
  return result;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  bootstrapSecondApproverProduction({ execute: process.argv.includes('--execute') }).catch((error) => {
    const message = error instanceof Error ? error.message : 'Second approver bootstrap failed.';
    console.error(`[second-approver] REFUSED: ${message}`);
    process.exit(1);
  });
}

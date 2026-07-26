#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { requireAuthorizedApprover } from './lib/authorized-approvers.mjs';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const WORKFLOW = 'Privileged Access Rotation Evidence';
const JOB = 'verify-rotation';
const OUTPUT_PATH = 'launch_package/admin-credential-login-proof.json';
const PRIVILEGED_ROLES = new Set(['admin', 'super_admin', 'ceo', 'operations_admin', 'finance_admin']);
const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const fail = (message) => {
  console.error(`[admin-credential-login] FAIL — ${message}`);
  process.exit(1);
};
const parseJson = async (response) => {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : null; }
  catch { return { raw: raw.slice(0, 500) }; }
};

if (process.env.GITHUB_ACTIONS !== 'true') fail('verifier may only run in GitHub Actions');
if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') fail('verifier requires protected main');
if (process.env.GITHUB_WORKFLOW !== WORKFLOW || process.env.GITHUB_JOB !== JOB) fail('unexpected protected workflow context');
try { requireAuthorizedApprover(process.env.GITHUB_ACTOR); } catch (error) { fail(error.message); }

const commitSha = text(process.env.GITHUB_SHA);
const workflowRunId = text(process.env.GITHUB_RUN_ID);
const apiKey = text(process.env.VITE_FIREBASE_API_KEY);
const email = lower(process.env.E2E_ADMIN_EMAIL);
const password = text(process.env.E2E_ADMIN_PASSWORD);
if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d+$/.test(workflowRunId)) fail('exact commit SHA and numeric workflow run ID are required');
if (!apiKey || !/^\S+@\S+\.\S+$/.test(email) || !password) fail('protected Firebase API key and Admin credentials are required');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) fail(`unexpected Firebase project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);
const adminUser = await admin.auth().getUserByEmail(email);
if (adminUser.disabled) fail('Admin account is disabled');
if (!adminUser.emailVerified) fail('Admin email is not verified');
const role = lower(adminUser.customClaims?.role || adminUser.customClaims?.userRole);
if (!PRIVILEGED_ROLES.has(role) && adminUser.customClaims?.admin !== true && adminUser.customClaims?.superAdmin !== true) {
  fail('credential is not bound to a privileged Admin account');
}

const endpoint = new URL('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword');
endpoint.searchParams.set('key', apiKey);
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    Referer: 'https://bin-group-admin-panel.web.app/',
  },
  body: JSON.stringify({ email, password, returnSecureToken: true }),
});
const payload = await parseJson(response);
if (!response.ok) {
  const providerMessage = text(payload?.error?.message || payload?.error || payload?.raw || `HTTP ${response.status}`);
  fail(`rotated Admin credential was rejected by Firebase Auth: ${providerMessage.slice(0, 160)}`);
}

const idToken = text(payload?.idToken);
const pendingCredential = text(payload?.mfaPendingCredential);
const mfaInfo = Array.isArray(payload?.mfaInfo) ? payload.mfaInfo : [];
const responseUid = text(payload?.localId);
const directAuthentication = Boolean(idToken);
const mfaChallengeIssued = Boolean(pendingCredential && mfaInfo.length > 0);
if (!directAuthentication && !mfaChallengeIssued) fail('Firebase Auth neither authenticated the Admin nor issued the required MFA challenge');
if (responseUid && responseUid !== adminUser.uid) fail('Firebase Auth response is bound to a different Admin UID');

const enrolledFactors = Array.isArray(adminUser.multiFactor?.enrolledFactors)
  ? adminUser.multiFactor.enrolledFactors
  : [];
if (!directAuthentication && enrolledFactors.length < 1) fail('MFA challenge was issued but the Admin account has no enrolled Firebase MFA factor');

const observedAt = new Date().toISOString();
const proof = {
  schemaVersion: 1,
  status: 'passed',
  source: 'firebase-auth-rotated-admin-credential-verifier',
  sourceSystem: 'Firebase Authentication password sign-in and MFA challenge',
  commitSha,
  projectId,
  workflowRunId,
  adminUidHash: sha256(adminUser.uid),
  adminEmailHash: sha256(email),
  role,
  directAuthentication,
  mfaChallengeIssued,
  enrolledMfaFactorCount: enrolledFactors.length,
  authOutcome: mfaChallengeIssued ? 'password-accepted-mfa-challenge-issued' : 'password-accepted-authenticated',
  observedAt,
  hardLaunchClaim: false,
};
mkdirSync('launch_package', { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[admin-credential-login] PASS outcome=${proof.authOutcome}`);

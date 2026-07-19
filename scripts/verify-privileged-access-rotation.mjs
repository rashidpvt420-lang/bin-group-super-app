#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const OUTPUT_PATH = 'launch_package/operational-proof.json';
const SECRET_ENDPOINTS = Object.freeze([
  { name: 'STRIPE_SECRET_KEY', url: 'https://secretmanager.googleapis.com/v1/projects/bin-group-57c60/secrets/STRIPE_SECRET_KEY/versions?pageSize=100' },
  { name: 'STRIPE_WEBHOOK_SECRET', url: 'https://secretmanager.googleapis.com/v1/projects/bin-group-57c60/secrets/STRIPE_WEBHOOK_SECRET/versions?pageSize=100' },
  { name: 'SMTP_PASS', url: 'https://secretmanager.googleapis.com/v1/projects/bin-group-57c60/secrets/SMTP_PASS/versions?pageSize=100' },
]);
const text = (value) => String(value ?? '').trim();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message) => {
  console.error(`[privileged-access-rotation] FAIL — ${message}`);
  process.exit(1);
};
const time = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (Number.isFinite(Number(value?._seconds))) return Number(value._seconds) * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const recent = (value, now) => {
  const observed = time(value);
  return observed > 0 && observed <= now + 5 * 60 * 1000 && now - observed <= MAX_AGE_MS;
};

if (process.env.GITHUB_ACTIONS !== 'true') fail('verifier may only run in GitHub Actions');
if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') fail('verifier requires protected main');
if (process.env.GITHUB_WORKFLOW !== 'Privileged Access Rotation Evidence' || process.env.GITHUB_JOB !== 'verify-rotation') fail('unexpected workflow context');
if (process.env.GITHUB_ACTOR !== 'rashidpvt420-lang') fail('only the authorized founder may run rotation evidence');
const commitSha = text(process.env.GITHUB_SHA);
const sourceRunId = text(process.env.GITHUB_RUN_ID);
const adminEmail = text(process.env.E2E_ADMIN_EMAIL).toLowerCase();
if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d+$/.test(sourceRunId)) fail('exact commit SHA and workflow run ID are required');
if (!/^\S+@\S+\.\S+$/.test(adminEmail)) fail('protected Admin email binding is required');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) fail(`unexpected Firebase project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();
const now = Date.now();

const googleAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const googleClient = await googleAuth.getClient();
const rotatedSecrets = [];
for (const secret of SECRET_ENDPOINTS) {
  const response = await googleClient.request({ url: secret.url, method: 'GET' });
  const versions = Array.isArray(response.data?.versions) ? response.data.versions : [];
  const sorted = versions
    .filter((version) => text(version?.name) && time(version?.createTime) > 0)
    .sort((left, right) => time(right.createTime) - time(left.createTime));
  const latestEnabled = sorted.find((version) => text(version.state).toUpperCase() === 'ENABLED');
  if (!latestEnabled || !recent(latestEnabled.createTime, now)) fail(`${secret.name} has no recently created enabled Secret Manager version`);
  const previousRevoked = sorted.filter((version) => version.name !== latestEnabled.name && ['DISABLED', 'DESTROYED'].includes(text(version.state).toUpperCase()));
  if (!previousRevoked.length) fail(`${secret.name} has no disabled or destroyed previous version`);
  rotatedSecrets.push({
    name: secret.name,
    latestVersionId: text(latestEnabled.name).split('/').pop(),
    rotatedAt: new Date(time(latestEnabled.createTime)).toISOString(),
    previousRevokedCount: previousRevoked.length,
  });
}

const adminUser = await admin.auth().getUserByEmail(adminEmail);
if (adminUser.disabled) fail('Admin account is disabled');
const tokensValidAfterMs = time(adminUser.tokensValidAfterTime);
if (!recent(adminUser.tokensValidAfterTime, now)) fail('Admin refresh-token revocation is missing or older than seven days');
const rotationSnap = await db.collection('security_rotation_records').doc('admin-credential-latest').get();
if (!rotationSnap.exists) fail('admin credential rotation record is missing');
const rotation = rotationSnap.data() || {};
if (text(rotation.status).toUpperCase() !== 'COMPLETED' || rotation.passwordRotated !== true || rotation.refreshTokensRevoked !== true) fail('Admin credential rotation record is incomplete');
if (text(rotation.adminUidHash) !== hash(adminUser.uid)) fail('Admin credential rotation record is bound to a different account');
if (!recent(rotation.passwordRotatedAt, now) || !recent(rotation.tokensRevokedAt, now)) fail('Admin credential rotation timestamps are invalid or stale');
if (Math.abs(time(rotation.tokensRevokedAt) - tokensValidAfterMs) > 10 * 60 * 1000) fail('Firebase token revocation time does not match the rotation record');

const rotationRecordId = hash(JSON.stringify({
  adminUidHash: hash(adminUser.uid),
  tokensValidAfterTime: new Date(tokensValidAfterMs).toISOString(),
  rotatedSecrets,
}));
const observedAt = new Date().toISOString();
const proof = {
  schemaVersion: 1,
  status: 'passed',
  generatedByWorkflow: true,
  gateKey: 'privilegedAccessRotation',
  evidenceType: 'secret-rotation-record',
  commitSha,
  projectId,
  sourceRunId,
  sourceSystem: 'Google Secret Manager and Firebase Authentication',
  observedAt,
  previousCredentialsRevoked: true,
  rotationRecordId,
  rotatedSecrets,
  adminUidHash: hash(adminUser.uid),
  adminTokensValidAfterTime: new Date(tokensValidAfterMs).toISOString(),
  checks: [
    { name: 'Stripe secret key rotated and previous version revoked', status: 'passed', reference: 'secretmanager://STRIPE_SECRET_KEY' },
    { name: 'Stripe webhook secret rotated and previous version revoked', status: 'passed', reference: 'secretmanager://STRIPE_WEBHOOK_SECRET' },
    { name: 'SMTP password rotated and previous version revoked', status: 'passed', reference: 'secretmanager://SMTP_PASS' },
    { name: 'Admin password rotation record verified against token revocation', status: 'passed', reference: 'firebase-auth://admin-credential-rotation' },
  ],
};
mkdirSync('launch_package', { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[privileged-access-rotation] PASS record=${rotationRecordId.slice(0, 12)}…`);

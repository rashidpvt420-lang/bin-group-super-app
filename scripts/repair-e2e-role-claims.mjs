import admin from 'firebase-admin';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

for (const envPath of [
  path.resolve(process.cwd(), '.env.e2e'),
  path.resolve(process.cwd(), 'bin-group-super-app/.env.e2e'),
]) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
    console.log(`Loaded E2E environment from: ${envPath}`);
    break;
  }
}

const roleDefinitions = [
  { role: 'admin', emailKey: 'E2E_ADMIN_EMAIL', claims: { role: 'admin', admin: true, testAccount: true } },
  { role: 'owner', emailKey: 'E2E_OWNER_EMAIL', claims: { role: 'owner', testAccount: true } },
  { role: 'tenant', emailKey: 'E2E_TENANT_EMAIL', claims: { role: 'tenant', testAccount: true } },
  { role: 'technician', emailKey: 'E2E_TECHNICIAN_EMAIL', claims: { role: 'technician', testAccount: true } },
  { role: 'broker', emailKey: 'E2E_BROKER_EMAIL', claims: { role: 'broker', testAccount: true } },
];

const missing = roleDefinitions
  .filter(({ emailKey }) => !String(process.env[emailKey] || '').trim())
  .map(({ emailKey }) => emailKey);

if (missing.length) {
  throw new Error(`Missing E2E role emails: ${missing.join(', ')}`);
}

const projectId = resolveFirebaseAdminProjectId();
initializeFirebaseAdmin(admin, projectId);
const auth = admin.auth();
const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();

for (const definition of roleDefinitions) {
  const email = String(process.env[definition.emailKey]).trim().toLowerCase();
  const user = await auth.getUserByEmail(email);
  const existingClaims = user.customClaims || {};
  const nextClaims = { ...existingClaims, ...definition.claims };

  await auth.setCustomUserClaims(user.uid, nextClaims);
  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email,
    displayName: user.displayName || `E2E ${definition.role}`,
    role: definition.role,
    userRole: definition.role,
    primaryRole: definition.role,
    status: 'active',
    testAccount: true,
    onboardingComplete: true,
    ...(definition.role === 'admin' ? { admin: true, isAdmin: true, adminApproved: true } : {}),
    ...(definition.role === 'technician' ? { approvalStatus: 'APPROVED', dutyStatus: 'ON_DUTY', dispatchReady: true } : {}),
    ...(definition.role === 'broker' ? { adminApproved: true, brokerStatus: 'ACTIVE', kycStatus: 'VERIFIED' } : {}),
    updatedAt: now,
  }, { merge: true });

  console.log(`Repaired ${definition.role} claims/profile for ${email} (${user.uid})`);
}

console.log(`E2E role claim repair complete in Firebase project ${projectId}.`);
console.log('Sign out and sign back in before rerunning role tests so refreshed ID tokens include the repaired claims.');

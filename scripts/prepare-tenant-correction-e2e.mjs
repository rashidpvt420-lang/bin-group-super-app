#!/usr/bin/env node
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
    break;
  }
}

const projectId = resolveFirebaseAdminProjectId();
const tenantEmail = String(process.env.E2E_TENANT_EMAIL || '').trim().toLowerCase();
if (!tenantEmail) throw new Error('E2E_TENANT_EMAIL is required for Tenant correction evidence preparation.');

initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();

let tenantUser;
try {
  tenantUser = await admin.auth().getUserByEmail(tenantEmail);
} catch (error) {
  if (error?.code === 'auth/user-not-found') {
    throw new Error(`Tenant E2E Auth account does not exist: ${tenantEmail}`);
  }
  throw error;
}

if (!tenantUser.emailVerified || tenantUser.disabled) {
  throw new Error('Tenant E2E Auth account must be active with a verified email.');
}

const tenantUid = tenantUser.uid;
const baselineName = 'E2E Emergency Contact Baseline';
const baselinePhone = '+971500009901';

await db.collection('users').doc(tenantUid).set({
  uid: tenantUid,
  email: tenantEmail,
  displayName: tenantUser.displayName || 'E2E Tenant',
  role: 'tenant',
  userRole: 'tenant',
  primaryRole: 'tenant',
  status: 'active',
  emergencyContact: {
    name: baselineName,
    phone: baselinePhone,
  },
  e2eLaunchSeed: true,
  e2eTenantCorrectionBaseline: true,
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
}, { merge: true });

const profileSnap = await db.collection('users').doc(tenantUid).get();
const profile = profileSnap.exists ? profileSnap.data() || {} : {};
const canonicalPropertyId = String(profile.propertyId || '').trim();
const canonicalUnitId = String(profile.unitId || profile.assignedUnitId || '').trim();

// The live launch seeder creates the reviewed Tenant/property/unit binding.
// Correction evidence must reuse that binding rather than creating a second,
// unscoped property that the browser is deliberately not authorized to read.
if (!canonicalPropertyId || !canonicalUnitId) {
  throw new Error('Tenant correction evidence requires a canonical propertyId and unitId from the live-role fixture.');
}

const [propertySnap, unitSnap] = await Promise.all([
  db.collection('properties').doc(canonicalPropertyId).get(),
  db.collection('units').doc(canonicalUnitId).get(),
]);
if (!propertySnap.exists) {
  throw new Error(`Tenant correction evidence canonical property is missing: ${canonicalPropertyId}`);
}
if (!unitSnap.exists || String(unitSnap.data()?.propertyId || '').trim() !== canonicalPropertyId) {
  throw new Error(`Tenant correction evidence canonical unit is missing or mismatched: ${canonicalUnitId}`);
}

const legacyUnitRef = db.collection('units').doc(`e2e-launch-unit-${tenantUid}`);
const legacyUnitSnap = await legacyUnitRef.get();
let legacyUnitDeleted = false;
if (
  legacyUnitSnap.exists
  && legacyUnitSnap.data()?.e2eLaunchSeed === true
  && String(legacyUnitSnap.data()?.propertyId || '').trim() === 'e2e-launch-property'
) {
  await legacyUnitRef.delete();
  legacyUnitDeleted = true;
}

console.log(`[tenant-correction-e2e] propertyId=${canonicalPropertyId}`);
console.log(`[tenant-correction-e2e] unitId=${canonicalUnitId}`);
console.log(`[tenant-correction-e2e] legacyUnitDeleted=${legacyUnitDeleted}`);
const snapshot = await db.collection('tenant_correction_requests')
  .where('tenantUid', '==', tenantUid)
  .limit(100)
  .get();

let deletedEvents = 0;
for (const correction of snapshot.docs) {
  const events = await correction.ref.collection('events').limit(100).get();
  for (const eventDocument of events.docs) {
    await eventDocument.ref.delete();
    deletedEvents += 1;
  }
  await correction.ref.delete();
}

console.log(`[tenant-correction-e2e] projectId=${projectId}`);
console.log(`[tenant-correction-e2e] tenantUid=${tenantUid}`);
console.log(`[tenant-correction-e2e] baseline=${baselineName}`);
console.log(`[tenant-correction-e2e] deletedRequests=${snapshot.size}`);
console.log(`[tenant-correction-e2e] deletedEvents=${deletedEvents}`);

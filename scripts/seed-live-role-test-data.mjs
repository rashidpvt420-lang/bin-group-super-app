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

const projectId = resolveFirebaseAdminProjectId();
const tenantEmail = String(process.env.E2E_TENANT_EMAIL || '').trim().toLowerCase();
const ownerEmail = String(process.env.E2E_OWNER_EMAIL || '').trim().toLowerCase();
const technicianEmail = String(process.env.E2E_TECHNICIAN_EMAIL || '').trim().toLowerCase();
const brokerEmail = String(process.env.E2E_BROKER_EMAIL || '').trim().toLowerCase();

const missing = [
  ['E2E_TENANT_EMAIL', tenantEmail],
  ['E2E_TECHNICIAN_EMAIL', technicianEmail],
  ['E2E_BROKER_EMAIL', brokerEmail],
].filter(([, value]) => !value).map(([key]) => key);

if (missing.length) {
  throw new Error(`Missing required live-role fixture values: ${missing.join(', ')}`);
}

initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();

function safeId(value) {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

async function getUserByEmailOrNull(email) {
  if (!email) return null;
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return null;
    throw err;
  }
}

function uniqueDocs(docs) {
  const seen = new Set();
  return docs.filter((docSnap) => {
    if (seen.has(docSnap.ref.path)) return false;
    seen.add(docSnap.ref.path);
    return true;
  });
}

const [tenantUser, ownerUser, technicianUser, brokerUser] = await Promise.all([
  getUserByEmailOrNull(tenantEmail),
  getUserByEmailOrNull(ownerEmail),
  getUserByEmailOrNull(technicianEmail),
  getUserByEmailOrNull(brokerEmail),
]);

if (!tenantUser?.uid) throw new Error(`Tenant launch account does not exist in Firebase Auth: ${tenantEmail}`);
if (!technicianUser?.uid) throw new Error(`Technician launch account does not exist in Firebase Auth: ${technicianEmail}`);
if (!brokerUser?.uid) throw new Error(`Broker launch account does not exist in Firebase Auth: ${brokerEmail}`);

const ownerUid = ownerUser?.uid || 'e2e-owner-placeholder';
const tenantUid = tenantUser.uid;
const technicianUid = technicianUser.uid;
const brokerUid = brokerUser.uid;

const propertyId = 'e2e-live-role-property';
const unitId = `e2e-live-role-unit-${safeId(tenantUid)}`;
const contractId = `e2e-live-role-contract-${safeId(tenantUid)}`;
const technicianTicketId = `e2e-live-technician-ticket-${safeId(technicianUid)}`;
const brokerCommissionId = `e2e-live-broker-commission-${safeId(brokerUid)}`;

// Match Playwright technician E2E geolocation mock (business-technician.spec.ts).
const gps = {
  lat: 25.2048,
  lng: 55.2708,
  latitude: 25.2048,
  longitude: 55.2708,
  address: 'E2E Live Role Tower, Dubai Marina, UAE',
};

const gpsPayload = {
  address: gps.address,
  locationAddress: gps.address,
  latitude: gps.latitude,
  longitude: gps.longitude,
  lat: gps.lat,
  lng: gps.lng,
  geoPoint: gps,
  gps,
  coordinates: gps,
  location: gps,
  propertyLocation: gps,
};

await db.collection('properties').doc(propertyId).set({
  id: propertyId,
  name: 'E2E Live Role Tower',
  propertyName: 'E2E Live Role Tower',
  ...gpsPayload,
  propertyType: 'RESIDENTIAL_BUILDING',
  type: 'RESIDENTIAL_BUILDING',
  ownerId: ownerUid,
  ownerUid,
  ownerEmail: ownerEmail || null,
  tenantId: tenantUid,
  tenantUid,
  tenantEmail,
  authorizedTenantIds: [tenantUid],
  authorizedTenantEmails: [tenantEmail],
  units: 1,
  floors: 1,
  status: 'ACTIVE',
  contractStatus: 'ACTIVE',
  e2eLaunchSeed: true,
  updatedAt: now,
  createdAt: now,
}, { merge: true });

if (ownerUser?.uid) {
  await db.collection('users').doc(ownerUid).set({
    uid: ownerUid,
    email: ownerEmail,
    role: 'owner',
    userRole: 'owner',
    primaryRole: 'owner',
    status: 'active',
    onboardingComplete: true,
    paymentVerified: true,
    adminApproved: true,
    dashboardUnlocked: true,
    activeContractId: contractId,
    e2eLaunchSeed: true,
    updatedAt: now,
  }, { merge: true });
}

await db.collection('contracts').doc(contractId).set({
  id: contractId,
  propertyId,
  propertyName: 'E2E Live Role Tower',
  ownerId: ownerUid,
  ownerUid,
  ownerEmail: ownerEmail || null,
  tenantId: tenantUid,
  tenantUid,
  tenantEmail,
  status: 'ACTIVE',
  contractStatus: 'ACTIVE',
  contractType: 'MAINTENANCE_AND_PROPERTY_MANAGEMENT',
  serviceMode: 'MAINTENANCE_AND_PROPERTY_MANAGEMENT',
  maintenanceIncluded: true,
  propertyManagementIncluded: true,
  tenantContractRequired: true,
  e2eLaunchSeed: true,
  updatedAt: now,
  createdAt: now,
}, { merge: true });

const seededUnitPayload = {
  id: unitId,
  unitId,
  unitNumber: 'E2E-101',
  floorNumber: '1',
  propertyId,
  propertyName: 'E2E Live Role Tower',
  ...gpsPayload,
  tenantId: tenantUid,
  tenantUid,
  tenantEmail,
  tenantName: tenantUser.displayName || 'E2E Tenant',
  contractId,
  activeContractId: contractId,
  status: 'OCCUPIED',
  occupancyStatus: 'OCCUPIED',
  e2eLaunchSeed: true,
  updatedAt: now,
  createdAt: now,
};

await db.collection('units').doc(unitId).set(seededUnitPayload, { merge: true });

const unitQueries = await Promise.all([
  db.collection('units').where('tenantId', '==', tenantUid).get(),
  db.collection('units').where('tenantUid', '==', tenantUid).get(),
  db.collection('units').where('tenantEmail', '==', tenantEmail).get(),
]);

const tenantUnitDocs = uniqueDocs(unitQueries.flatMap((snap) => snap.docs));
const batch = db.batch();
tenantUnitDocs.forEach((docSnap) => {
  batch.set(docSnap.ref, {
    propertyId,
    propertyName: 'E2E Live Role Tower',
    ...gpsPayload,
    tenantId: tenantUid,
    tenantUid,
    tenantEmail,
    contractId,
    activeContractId: contractId,
    status: 'OCCUPIED',
    occupancyStatus: 'OCCUPIED',
    e2eLaunchSeed: true,
    updatedAt: now,
  }, { merge: true });
});
await batch.commit();

await db.collection('users').doc(tenantUid).set({
  uid: tenantUid,
  email: tenantEmail,
  displayName: tenantUser.displayName || 'E2E Tenant',
  role: 'tenant',
  userRole: 'tenant',
  primaryRole: 'tenant',
  status: 'active',
  onboardingComplete: true,
  assignedPropertyId: propertyId,
  assignedUnitId: unitId,
  activeContractId: contractId,
  e2eLaunchSeed: true,
  updatedAt: now,
}, { merge: true });

await db.collection('users').doc(technicianUid).set({
  uid: technicianUid,
  email: technicianEmail,
  displayName: technicianUser.displayName || 'E2E Technician',
  role: 'technician',
  userRole: 'technician',
  primaryRole: 'technician',
  status: 'active',
  onboardingComplete: true,
  onDuty: true,
  dutyStatus: 'ON_DUTY',
  dispatchReady: true,
  approvalStatus: 'APPROVED',
  e2eLaunchSeed: true,
  updatedAt: now,
}, { merge: true });

await db.collection('technicians').doc(technicianUid).set({
  uid: technicianUid,
  email: technicianEmail,
  fullName: technicianUser.displayName || 'E2E Technician',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  dutyStatus: 'ON_DUTY',
  dispatchReady: true,
  primaryTrade: 'General Maintenance',
  serviceZone: 'Al Ain',
  e2eLaunchSeed: true,
  updatedAt: now,
}, { merge: true });

const beforeProof = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrC8AAAAASUVORK5CYII=';
await db.collection('maintenanceTickets').doc(technicianTicketId).set({
  id: technicianTicketId,
  ticketId: technicianTicketId,
  propertyId,
  propertyName: 'E2E Live Role Tower',
  unitId,
  unitNumber: 'E2E-101',
  floorNumber: '1',
  tenantId: tenantUid,
  tenantUid,
  tenantEmail,
  tenantName: tenantUser.displayName || 'E2E Tenant',
  assignedTechnicianId: technicianUid,
  technicianId: technicianUid,
  assignedTechnicianEmail: technicianEmail,
  category: 'HVAC / AC systems',
  complaintCategory: 'HVAC / AC systems',
  description: 'E2E staging mission: air conditioning is not cooling.',
  serviceLocationDetail: 'Living room indoor AC unit',
  priority: 'HIGH',
  status: 'ASSIGNED',
  lifecycleStatus: 'ASSIGNED',
  proofPhotos: admin.firestore.FieldValue.delete(),
  afterPhotos: admin.firestore.FieldValue.delete(),
  completionPhotos: admin.firestore.FieldValue.delete(),
  afterPhotoUrl: admin.firestore.FieldValue.delete(),
  technicianNotes: admin.firestore.FieldValue.delete(),
  beforePhotoUrl: beforeProof,
  tenantPhotos: [beforeProof],
  initialPhotoUrls: [beforeProof],
  photos: [beforeProof],
  permissionToEnter: 'CALL_FIRST',
  isAnyoneHome: 'YES',
  ...gpsPayload,
  e2eLaunchSeed: true,
  createdAt: now,
  updatedAt: now,
}, { merge: true });

await db.collection('users').doc(brokerUid).set({
  uid: brokerUid,
  email: brokerEmail,
  displayName: brokerUser.displayName || 'E2E Broker',
  role: 'broker',
  userRole: 'broker',
  primaryRole: 'broker',
  status: 'active',
  onboardingComplete: true,
  adminApproved: true,
  brokerStatus: 'ACTIVE',
  kycStatus: 'VERIFIED',
  e2eLaunchSeed: true,
  updatedAt: now,
}, { merge: true });

await db.collection('broker_commissions').doc(brokerCommissionId).set({
  id: brokerCommissionId,
  brokerId: brokerUid,
  brokerUid,
  brokerEmail,
  linkedLeadName: 'E2E Staging Attribution Fixture',
  linkedProperty: 'E2E Live Role Tower',
  amount: 500,
  currency: 'AED',
  percentage: 10,
  status: 'pending',
  payoutStatus: 'not_requested',
  attributionId: `e2e_attribution_${safeId(brokerUid)}`,
  commissionLockKey: `e2e_commission_lock_${safeId(brokerUid)}`,
  commissionLocked: true,
  e2eLaunchSeed: true,
  createdAt: now,
  updatedAt: now,
}, { merge: true });

console.log(`Seeded five-role staging fixtures in project ${projectId}`);
console.log(`tenantUid=${tenantUid}`);
console.log(`technicianUid=${technicianUid}`);
console.log(`brokerUid=${brokerUid}`);
console.log(`propertyId=${propertyId}`);
console.log(`unitId=${unitId}`);
console.log(`contractId=${contractId}`);
console.log(`technicianTicketId=${technicianTicketId}`);
console.log(`brokerCommissionId=${brokerCommissionId}`);
console.log(`repairedTenantUnits=${tenantUnitDocs.length}`);

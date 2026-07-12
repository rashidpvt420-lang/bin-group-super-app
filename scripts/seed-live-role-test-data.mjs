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
  ['E2E_OWNER_EMAIL', ownerEmail],
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
if (!ownerUser?.uid) throw new Error(`Owner launch account does not exist in Firebase Auth: ${ownerEmail}`);
if (!technicianUser?.uid) throw new Error(`Technician launch account does not exist in Firebase Auth: ${technicianEmail}`);
if (!brokerUser?.uid) throw new Error(`Broker launch account does not exist in Firebase Auth: ${brokerEmail}`);

const ownerUid = ownerUser.uid;
const tenantUid = tenantUser.uid;
const technicianUid = technicianUser.uid;
const brokerUid = brokerUser.uid;

const propertyId = 'e2e-live-role-property';
const unitId = `e2e-live-role-unit-${safeId(tenantUid)}`;
const contractId = `e2e-live-role-contract-${safeId(tenantUid)}`;
const technicianTicketId = `e2e-live-technician-ticket-${safeId(technicianUid)}`;
const poolTicketId = 'e2e-live-pool-ticket-open';
const brokerCommissionId = `e2e-live-broker-commission-${safeId(brokerUid)}`;
const sosTicketId = 'e2e-live-sos-ticket';
const ownerPaymentPendingContractId = 'e2e-live-owner-payment-pending';
const technicianCompletedTicketId = `e2e-live-technician-completed-${safeId(technicianUid)}`;
const brokerDocumentId = `e2e-live-broker-document-${safeId(brokerUid)}`;

const gps = {
  lat: 24.2075,
  lng: 55.7447,
  latitude: 24.2075,
  longitude: 55.7447,
  address: 'E2E Live Role Tower, Al Ain, UAE',
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
  beforePhotoUrl: beforeProof,
  tenantPhotos: [beforeProof],
  initialPhotoUrls: [beforeProof],
  permissionToEnter: 'CALL_FIRST',
  isAnyoneHome: 'YES',
  ...gpsPayload,
  e2eLaunchSeed: true,
  createdAt: now,
  updatedAt: now,
}, { merge: true });

// OPEN pool ticket for optional Tech A/B race-condition walkthrough (unassigned).
await db.collection('maintenanceTickets').doc(poolTicketId).set({
  id: poolTicketId,
  ticketId: poolTicketId,
  propertyId,
  propertyName: 'E2E Live Role Tower',
  unitId,
  unitNumber: 'E2E-101',
  floorNumber: '1',
  tenantId: tenantUid,
  tenantUid,
  tenantEmail,
  tenantName: tenantUser.displayName || 'E2E Tenant',
  assignedTechnicianId: null,
  technicianId: null,
  category: 'Plumbing / water systems',
  complaintCategory: 'Plumbing / water systems',
  description: 'E2E open pool mission for concurrent technician claim proof.',
  serviceLocationDetail: 'Kitchen sink leak',
  priority: 'MEDIUM',
  status: 'OPEN',
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

// SOS ticket for tenant → admin visibility profile gate.
await db.collection('maintenanceTickets').doc(sosTicketId).set({
  id: sosTicketId,
  ticketId: sosTicketId,
  propertyId,
  propertyName: 'E2E Live Role Tower',
  unitId,
  unitNumber: 'E2E-101',
  floorNumber: '1',
  tenantId: tenantUid,
  tenantUid,
  tenantEmail,
  tenantName: tenantUser.displayName || 'E2E Tenant',
  category: 'emergency',
  priority: 'emergency',
  description: 'TENANT TRIGGERED SOS EMERGENCY (E2E seed)',
  status: 'emergency_submitted',
  sosStatus: 'ACTIVE',
  isSOS: true,
  emergency: true,
  requiresImmediateDispatch: true,
  slaMinutes: 30,
  ...gpsPayload,
  e2eLaunchSeed: true,
  createdAt: now,
  updatedAt: now,
}, { merge: true });

// Pending owner payment contract for admin approve/reject gate (approve path UI only; do not auto-approve).
await db.collection('contracts').doc(ownerPaymentPendingContractId).set({
  id: ownerPaymentPendingContractId,
  paymentId: 'E2E_OWNER_PAYMENT_PENDING',
  amount: 7500,
  currency: 'AED',
  ownerId: ownerUid,
  ownerUid,
  ownerEmail: ownerEmail || null,
  propertyId,
  propertyName: 'E2E Live Role Tower',
  provider: 'Bank Transfer',
  status: 'pending_approval',
  paymentVerified: false,
  paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
  e2eLaunchSeed: true,
  createdAt: now,
  updatedAt: now,
}, { merge: true });

// Completed technician ticket for completion-audit profile gate.
await db.collection('maintenanceTickets').doc(technicianCompletedTicketId).set({
  id: technicianCompletedTicketId,
  ticketId: technicianCompletedTicketId,
  propertyId,
  propertyName: 'E2E Live Role Tower',
  unitId,
  unitNumber: 'E2E-101',
  tenantId: tenantUid,
  tenantUid,
  tenantEmail,
  assignedTechnicianId: technicianUid,
  technicianId: technicianUid,
  category: 'Electrical / power systems',
  description: 'E2E completed mission for technician completion audit proof.',
  priority: 'MEDIUM',
  status: 'CLOSED',
  qualityScore: 4.8,
  technicianScore: 4.8,
  completionPhotos: [beforeProof],
  afterPhotoUrl: beforeProof,
  ...gpsPayload,
  e2eLaunchSeed: true,
  createdAt: now,
  updatedAt: now,
}, { merge: true });

await db.collection('brokerDocuments').doc(brokerDocumentId).set({
  id: brokerDocumentId,
  brokerId: brokerUid,
  docType: 'emirates_id',
  fileName: 'e2e-emirates-id.pdf',
  fileUrl: 'https://bin-group-57c60.firebasestorage.app/e2e/emirates-id.pdf',
  status: 'pending_review',
  e2eLaunchSeed: true,
  uploadedAt: now,
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

const techBEmail = String(process.env.E2E_TECHNICIAN_B_EMAIL || '').trim().toLowerCase();
const techBPassword = String(process.env.E2E_TECHNICIAN_B_PASSWORD || '').trim();
if (techBEmail && techBPassword) {
  const techBUser = await getUserByEmailOrNull(techBEmail);
  if (!techBUser?.uid) {
    throw new Error(`Technician B account does not exist in Firebase Auth: ${techBEmail}. Run seed:e2e:gate11 first.`);
  }
  await db.collection('users').doc(techBUser.uid).set({
    uid: techBUser.uid,
    email: techBEmail,
    displayName: techBUser.displayName || 'E2E Technician B',
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
  await db.collection('technicians').doc(techBUser.uid).set({
    uid: techBUser.uid,
    email: techBEmail,
    fullName: techBUser.displayName || 'E2E Technician B',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    dutyStatus: 'ON_DUTY',
    dispatchReady: true,
    primaryTrade: 'General Maintenance',
    serviceZone: 'Al Ain',
    e2eLaunchSeed: true,
    updatedAt: now,
  }, { merge: true });
  console.log(`technicianBUid=${techBUser.uid}`);
}

console.log(`Seeded five-role staging fixtures in project ${projectId}`);
console.log(`tenantUid=${tenantUid}`);
console.log(`technicianUid=${technicianUid}`);
console.log(`brokerUid=${brokerUid}`);
console.log(`propertyId=${propertyId}`);
console.log(`unitId=${unitId}`);
console.log(`contractId=${contractId}`);
console.log(`technicianTicketId=${technicianTicketId}`);
console.log(`poolTicketId=${poolTicketId}`);
console.log(`brokerCommissionId=${brokerCommissionId}`);
console.log(`sosTicketId=${sosTicketId}`);
console.log(`ownerPaymentPendingContractId=${ownerPaymentPendingContractId}`);
console.log(`technicianCompletedTicketId=${technicianCompletedTicketId}`);
console.log(`brokerDocumentId=${brokerDocumentId}`);
console.log(`repairedTenantUnits=${tenantUnitDocs.length}`);

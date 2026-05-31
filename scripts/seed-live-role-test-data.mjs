import admin from 'firebase-admin';

const projectId = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'bin-group-57c60';
const tenantEmail = String(process.env.E2E_TENANT_EMAIL || '').trim().toLowerCase();
const ownerEmail = String(process.env.E2E_OWNER_EMAIL || '').trim().toLowerCase();

if (!tenantEmail) {
  throw new Error('E2E_TENANT_EMAIL is required before seeding live role test data.');
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

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

const tenantUser = await getUserByEmailOrNull(tenantEmail);
if (!tenantUser?.uid) {
  throw new Error(`Tenant launch account does not exist in Firebase Auth: ${tenantEmail}`);
}

const ownerUser = await getUserByEmailOrNull(ownerEmail);
const ownerUid = ownerUser?.uid || 'e2e-owner-placeholder';
const tenantUid = tenantUser.uid;

const propertyId = 'e2e-live-role-property';
const unitId = `e2e-live-role-unit-${safeId(tenantUid)}`;
const contractId = `e2e-live-role-contract-${safeId(tenantUid)}`;

await db.collection('properties').doc(propertyId).set({
  id: propertyId,
  name: 'E2E Live Role Tower',
  propertyName: 'E2E Live Role Tower',
  address: 'E2E Live Role Tower, Al Ain, UAE',
  locationAddress: 'E2E Live Role Tower, Al Ain, UAE',
  propertyType: 'RESIDENTIAL_BUILDING',
  type: 'RESIDENTIAL_BUILDING',
  ownerId: ownerUid,
  ownerUid,
  ownerEmail: ownerEmail || null,
  units: 1,
  floors: 1,
  location: {
    lat: 24.2075,
    lng: 55.7447,
    latitude: 24.2075,
    longitude: 55.7447,
    address: 'E2E Live Role Tower, Al Ain, UAE',
  },
  propertyLocation: {
    lat: 24.2075,
    lng: 55.7447,
    latitude: 24.2075,
    longitude: 55.7447,
    address: 'E2E Live Role Tower, Al Ain, UAE',
  },
  status: 'ACTIVE',
  contractStatus: 'ACTIVE',
  e2eLaunchSeed: true,
  updatedAt: now,
  createdAt: now,
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

await db.collection('units').doc(unitId).set({
  id: unitId,
  unitId,
  unitNumber: 'E2E-101',
  floorNumber: '1',
  propertyId,
  propertyName: 'E2E Live Role Tower',
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
}, { merge: true });

await db.collection('users').doc(tenantUid).set({
  uid: tenantUid,
  email: tenantEmail,
  displayName: tenantUser.displayName || 'E2E Tenant',
  role: 'tenant',
  status: 'active',
  assignedPropertyId: propertyId,
  assignedUnitId: unitId,
  activeContractId: contractId,
  e2eLaunchSeed: true,
  updatedAt: now,
}, { merge: true });

console.log(`Seeded live role tenant data for ${tenantEmail}`);
console.log(`tenantUid=${tenantUid}`);
console.log(`propertyId=${propertyId}`);
console.log(`unitId=${unitId}`);
console.log(`contractId=${contractId}`);

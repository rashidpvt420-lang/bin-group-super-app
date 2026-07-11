/**
 * Production launch workflow fixtures: technician ticket, broker commission, owner unlock.
 */
import admin from 'firebase-admin';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env.e2e');
if (existsSync(envPath)) loadDotenv({ path: envPath });

const projectId = process.env.GCLOUD_PROJECT || 'bin-group-57c60';
if (!admin.apps.length) admin.initializeApp({ projectId });

const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();

async function getUid(email) {
  if (!email) return null;
  try {
    return (await admin.auth().getUserByEmail(email.trim().toLowerCase())).uid;
  } catch {
    return null;
  }
}

const tenantEmail = process.env.E2E_TENANT_EMAIL || '';
const techEmail = process.env.E2E_TECHNICIAN_EMAIL || '';
const brokerEmail = process.env.E2E_BROKER_EMAIL || '';
const ownerEmail = process.env.E2E_OWNER_EMAIL || '';

const tenantUid = await getUid(tenantEmail);
const techUid = await getUid(techEmail);
const brokerUid = await getUid(brokerEmail);
const ownerUid = await getUid(ownerEmail);

if (!tenantUid || !techUid) {
  console.error('Missing tenant or technician E2E accounts. Run npm run seed:e2e:auth first.');
  process.exit(1);
}

const propertyId = 'e2e-live-role-property';
function safeId(value) {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
const unitId = `e2e-live-role-unit-${safeId(tenantUid)}`;
const contractId = `e2e-live-role-contract-${safeId(tenantUid)}`;
const ticketId = 'gate11-launch-pool-ticket';
const gps = { lat: 25.2048, lng: 55.2708, latitude: 25.2048, longitude: 55.2708, address: 'Dubai Marina, UAE' };

await db.collection('maintenanceTickets').doc(ticketId).set({
  id: ticketId,
  ticketId,
  title: 'E2E launch pool HVAC check',
  description: 'Gate 11/launch technician workflow — assigned job for proof upload.',
  category: 'HVAC',
  priority: 'HIGH',
  status: 'ASSIGNED',
  lifecycleStatus: 'ASSIGNED',
  technicianNotes: admin.firestore.FieldValue.delete(),
  proofPhotos: admin.firestore.FieldValue.delete(),
  afterPhotos: admin.firestore.FieldValue.delete(),
  completionPhotos: admin.firestore.FieldValue.delete(),
  afterPhotoUrl: admin.firestore.FieldValue.delete(),
  propertyId,
  unitId,
  tenantId: tenantUid,
  tenantUid,
  tenantEmail,
  tenantName: 'E2E Launch Tenant',
  propertyName: 'E2E Live Role Tower',
  unitNumber: '1204',
  floorNumber: '12',
  serviceLocationDetail: 'Master bedroom AC unit',
  specificLocation: 'Master bedroom AC unit',
  beforePhotoUrl: 'https://bin-group-57c60.web.app/favicon.ico',
  tenantPhotos: ['https://bin-group-57c60.web.app/favicon.ico'],
  photos: ['https://bin-group-57c60.web.app/favicon.ico'],
  assignedTechnicianId: techUid,
  technicianId: techUid,
  ...gps,
  location: gps,
  propertyLocation: gps,
  e2eLaunchSeed: true,
  createdAt: now,
  updatedAt: now,
}, { merge: true });

await db.collection('users').doc(techUid).set({
  uid: techUid,
  email: techEmail,
  role: 'technician',
  onDuty: true,
  dutyStatus: 'ON_DUTY',
  status: 'active',
  e2eLaunchSeed: true,
  updatedAt: now,
}, { merge: true });

if (brokerUid) {
  const commissionId = `e2e-broker-commission-${brokerUid.slice(0, 8)}`;
  await db.collection('broker_commissions').doc(commissionId).set({
    id: commissionId,
    brokerId: brokerUid,
    brokerUid,
    brokerEmail,
    propertyId,
    status: 'LOCKED',
    commissionState: 'LOCKED',
    amount: 1500,
    currency: 'AED',
    contractId: contractId,
    e2eLaunchSeed: true,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
}

if (ownerUid) {
  await db.collection('users').doc(ownerUid).set({
    uid: ownerUid,
    email: ownerEmail,
    role: 'owner',
    paymentVerified: true,
    adminApproved: true,
    onboardingComplete: true,
    dashboardUnlocked: true,
    activeContractId: contractId,
    status: 'active',
    e2eLaunchSeed: true,
    updatedAt: now,
  }, { merge: true });
}

console.log('Launch workflow fixtures seeded.');
console.log(`ticketId=${ticketId} assignedTechnicianId=${techUid}`);

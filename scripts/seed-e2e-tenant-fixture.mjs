import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "bin-group-57c60";

try {
  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID
  });
} catch (e) {
  console.error("Failed to initialize Firebase Admin. Ensure GOOGLE_APPLICATION_CREDENTIALS is set or you have run 'gcloud auth application-default login'.");
  console.error(e);
  process.exit(1);
}

const db = getFirestore();
const auth = getAuth();

async function run() {
  const tenantEmail = process.env.E2E_TENANT_EMAIL || 'tenant@bin.ae';
  
  console.log(`Looking up user by email: ${tenantEmail}`);
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(tenantEmail);
    console.log(`Found user: ${userRecord.uid}`);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log(`User ${tenantEmail} not found. Creating user...`);
      userRecord = await auth.createUser({
        email: tenantEmail,
        password: process.env.E2E_TENANT_PASSWORD || 'Password123!',
        displayName: 'E2E Tenant'
      });
      console.log(`Created user: ${userRecord.uid}`);
    } else {
      throw error;
    }
  }

  const tenantUid = userRecord.uid;

  console.log("Upserting user document...");
  await db.collection('users').doc(tenantUid).set({
    uid: tenantUid,
    email: tenantEmail,
    role: "TENANT",
    status: "ACTIVE",
    displayName: userRecord.displayName || "E2E Tenant"
  }, { merge: true });

  console.log("Upserting property document...");
  const propRef = db.collection('properties').doc('e2e-property-alain-001');
  await propRef.set({
    name: "E2E Al Ain Pilot Property",
    propertyName: "E2E Al Ain Pilot Property",
    ownerId: "e2e-owner",
    ownerUid: "e2e-owner",
    ownerEmail: "owner@bin.ae",
    address: "Al Ain, Abu Dhabi, UAE",
    emirate: "Abu Dhabi",
    location: { lat: 24.2075, lng: 55.7447 },
    status: "ACTIVE",
    launchFixture: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  console.log("Upserting unit document...");
  const unitRef = db.collection('units').doc('e2e-unit-tenant-001');
  await unitRef.set({
    tenantId: tenantUid,
    tenantUid: tenantUid,
    tenantEmail: tenantEmail.toLowerCase(),
    propertyId: "e2e-property-alain-001",
    unitNumber: "E2E-101",
    floorNumber: "1",
    status: "OCCUPIED",
    activeContractId: "e2e-contract-tenant-001",
    launchFixture: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  console.log("Upserting contract document...");
  const contractRef = db.collection('contracts').doc('e2e-contract-tenant-001');
  await contractRef.set({
    tenantId: tenantUid,
    tenantUid: tenantUid,
    tenantEmail: tenantEmail.toLowerCase(),
    propertyId: "e2e-property-alain-001",
    unitId: "e2e-unit-tenant-001",
    status: "ACTIVE",
    contractType: "MAINTENANCE_AND_PROPERTY_MANAGEMENT",
    launchFixture: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  console.log("E2E tenant fixture seeded successfully!");
}

run().catch((error) => {
  console.error("Fatal error seeding fixture:", error);
  process.exit(1);
});

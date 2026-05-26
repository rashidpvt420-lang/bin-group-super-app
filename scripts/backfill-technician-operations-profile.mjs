import admin from 'firebase-admin';

if (!admin.apps.length) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || 'bin-group-57c60' });
  } else {
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'bin-group-57c60' });
  }
}

const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp;

const keep = (value, fallback) => (value === undefined || value === null || value === '' ? fallback : value);

function operationalDefaults(existing = {}, user = {}) {
  const email = keep(existing.email, user.email || '');
  const name = keep(existing.fullName, user.fullName || user.displayName || user.name || 'Technician');
  return {
    uid: keep(existing.uid, user.uid || user.id || ''),
    technicianId: keep(existing.technicianId, user.uid || user.id || ''),
    fullName: name,
    displayName: keep(existing.displayName, name),
    email,
    phone: keep(existing.phone, user.phone || user.phoneNumber || user.mobile || ''),
    role: 'technician',
    status: keep(existing.status, 'active'),
    primaryTrade: keep(existing.primaryTrade, existing.trade || existing.specialization || user.primaryTrade || user.trade || 'General Maintenance'),
    trade: keep(existing.trade, existing.primaryTrade || existing.specialization || user.trade || 'General Maintenance'),
    skillLevel: keep(existing.skillLevel, user.skillLevel || 'Specialist'),
    vehicleAssigned: existing.vehicleAssigned ?? false,
    vehicleNumber: keep(existing.vehicleNumber, user.vehicleNumber || ''),
    toolKitIssued: existing.toolKitIssued ?? false,
    ppeIssued: existing.ppeIssued ?? false,
    medicalCardStatus: keep(existing.medicalCardStatus, user.medicalCardStatus || 'pending'),
    medicalCardExpiry: keep(existing.medicalCardExpiry, user.medicalCardExpiry || user.medicalExpiry || null),
    drivingLicenseStatus: keep(existing.drivingLicenseStatus, user.drivingLicenseStatus || 'pending'),
    drivingLicenseExpiry: keep(existing.drivingLicenseExpiry, user.drivingLicenseExpiry || null),
    certificationsStatus: keep(existing.certificationsStatus, user.certificationsStatus || (Array.isArray(existing.certifications) && existing.certifications.length ? 'valid' : 'pending')),
    certifications: Array.isArray(existing.certifications) ? existing.certifications : Array.isArray(user.certifications) ? user.certifications : [],
    dutyStatus: keep(existing.dutyStatus, user.dutyStatus || 'available'),
    onDuty: existing.onDuty ?? user.onDuty ?? true,
    dispatchReadiness: keep(existing.dispatchReadiness, 'ready'),
    syncStatus: keep(existing.syncStatus, 'partial'),
    updatedAt: ts(),
    lastSyncedAt: ts(),
  };
}

async function readDoc(collectionName, uid) {
  const snap = await db.collection(collectionName).doc(uid).get();
  return snap.exists ? snap.data() : {};
}

async function backfill() {
  console.log('[Technician Backfill] scanning users where role == technician');
  const usersSnap = await db.collection('users').where('role', '==', 'technician').get();
  console.log(`[Technician Backfill] found ${usersSnap.size} technician users`);

  let batch = db.batch();
  let writes = 0;

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const user = { uid, id: uid, ...userDoc.data() };
    const [techExisting, rosterExisting, hrExisting] = await Promise.all([
      readDoc('technicians', uid),
      readDoc('staff_roster', uid),
      readDoc('hr_staff', uid),
    ]);

    const techRecord = operationalDefaults(techExisting, user);
    const rosterRecord = operationalDefaults(rosterExisting, { ...user, ...techRecord });
    const hrRecord = operationalDefaults(hrExisting, { ...user, ...techRecord });

    batch.set(db.collection('technicians').doc(uid), techRecord, { merge: true });
    batch.set(db.collection('staff_roster').doc(uid), rosterRecord, { merge: true });
    batch.set(db.collection('hr_staff').doc(uid), hrRecord, { merge: true });
    writes += 3;

    if (writes >= 450) {
      await batch.commit();
      console.log(`[Technician Backfill] committed ${writes} writes`);
      batch = db.batch();
      writes = 0;
    }
  }

  if (writes > 0) await batch.commit();
  console.log('[Technician Backfill] completed');
}

backfill().catch((error) => {
  console.error('[Technician Backfill] failed:', error);
  process.exit(1);
});

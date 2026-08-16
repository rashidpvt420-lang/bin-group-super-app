#!/usr/bin/env node

import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';

export async function migrateLegacyStaffIdentities({
  dryRun = true,
  projectId = resolveFirebaseAdminProjectId(),
  authClient,
  firestoreClient,
} = {}) {
  initializeFirebaseAdmin(admin, projectId);
  const db = firestoreClient || admin.firestore();

  console.log(`[staff-identity-migration] Starting legacy staff identity migration check (dryRun: ${dryRun})...`);

  const usersSnap = await db.collection('users').get();
  const existingUserUids = new Set(usersSnap.docs.map((d) => d.id));
  const existingEmails = new Set(usersSnap.docs.map((d) => String(d.data().email || '').toLowerCase()).filter(Boolean));

  let technicianProfileCount = 0;
  let hrProfileCount = 0;
  let migratedCount = 0;
  let duplicateCount = 0;

  // 1. Audit Technicians Collection
  const techSnap = await db.collection('technicians').get();
  technicianProfileCount = techSnap.size;

  const batch = db.batch();
  let pendingBatchOps = 0;

  for (const doc of techSnap.docs) {
    const data = doc.data();
    const uid = doc.id;
    const email = String(data.email || '').toLowerCase();

    if (existingUserUids.has(uid) || (email && existingEmails.has(email))) {
      duplicateCount += 1;
      continue;
    }

    const masterProfile = {
      uid,
      email: email || `${uid}@staff.bingroups.ae`,
      displayName: data.name || data.fullName || 'Technician Staff',
      role: 'technician',
      trade: data.primaryTrade || data.trade || 'General Maintenance',
      dutyStatus: data.dutyStatus || 'OFF',
      assignedVehicleId: data.assignedVehicleId || null,
      status: data.status || 'active',
      isMigratedLegacyRecord: true,
      migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!dryRun) {
      batch.set(db.collection('users').doc(uid), masterProfile, { merge: true });
      pendingBatchOps += 1;
      if (pendingBatchOps >= 400) {
        await batch.commit();
        pendingBatchOps = 0;
      }
    }

    migratedCount += 1;
  }

  // 2. Audit HR Profiles Collection
  const hrSnap = await db.collection('hrProfiles').get();
  hrProfileCount = hrSnap.size;

  for (const doc of hrSnap.docs) {
    const data = doc.data();
    const uid = doc.id;
    const email = String(data.email || '').toLowerCase();

    if (existingUserUids.has(uid) || (email && existingEmails.has(email))) {
      duplicateCount += 1;
      continue;
    }

    const masterProfile = {
      uid,
      email: email || `${uid}@staff.bingroups.ae`,
      displayName: data.displayName || data.name || 'HR Staff',
      role: data.role || 'staff',
      department: data.department || 'HR',
      status: data.status || 'active',
      isMigratedLegacyRecord: true,
      migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!dryRun) {
      batch.set(db.collection('users').doc(uid), masterProfile, { merge: true });
      pendingBatchOps += 1;
    }

    migratedCount += 1;
  }

  if (!dryRun && pendingBatchOps > 0) {
    await batch.commit();
  }

  const summary = {
    dryRun,
    projectId,
    totalExistingUsers: existingUserUids.size,
    technicianProfilesFound: technicianProfileCount,
    hrProfilesFound: hrProfileCount,
    candidatesReadyForMigration: dryRun ? migratedCount : 0,
    identitiesMigrated: dryRun ? 0 : migratedCount,
    duplicatesSkipped: duplicateCount,
    status: 'SUCCESS',
  };

  console.log(`[staff-identity-migration] ${JSON.stringify(summary, null, 2)}`);
  return summary;
}

const isExecute = process.argv.includes('--execute');
migrateLegacyStaffIdentities({ dryRun: !isExecute }).catch((err) => {
  console.error('[staff-identity-migration] FAILED:', err);
  process.exit(1);
});

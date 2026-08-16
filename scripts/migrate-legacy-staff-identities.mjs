#!/usr/bin/env node

import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXECUTE_CONFIRMATION = 'MIGRATE_LEGACY_STAFF_IDENTITIES_BIN_GROUP';
const BATCH_PROFILE_LIMIT = 200; // each profile also writes one audit record

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const cleanText = (value) => String(value || '').trim();

async function authIdentityFor(authClient, uid) {
  try {
    const user = await authClient.getUser(uid);
    return {
      exists: true,
      disabled: user.disabled === true,
      email: normalizeEmail(user.email),
      displayName: cleanText(user.displayName),
    };
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return { exists: false };
    throw error;
  }
}

function buildCanonicalProfile({ uid, source, sourceData, authIdentity }) {
  const sourceEmail = normalizeEmail(sourceData.email);
  const authEmail = normalizeEmail(authIdentity.email);
  const displayName = cleanText(
    authIdentity.displayName || sourceData.displayName || sourceData.fullName || sourceData.name,
  );

  const profile = {
    uid,
    role: source === 'technicians' ? 'technician' : cleanText(sourceData.role) || 'staff',
    status: cleanText(sourceData.status) || 'profile_incomplete',
    isMigratedLegacyRecord: true,
    migratedFromCollection: source,
    migratedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (authEmail || sourceEmail) profile.email = authEmail || sourceEmail;
  if (displayName) profile.displayName = displayName;

  if (source === 'technicians') {
    const trade = cleanText(sourceData.primaryTrade || sourceData.trade);
    if (trade) profile.trade = trade;
    const dutyStatus = cleanText(sourceData.dutyStatus);
    if (dutyStatus) profile.dutyStatus = dutyStatus;
    if (sourceData.assignedVehicleId) profile.assignedVehicleId = sourceData.assignedVehicleId;
  } else {
    const department = cleanText(sourceData.department);
    if (department) profile.department = department;
  }

  return profile;
}

export async function migrateLegacyStaffIdentities({
  dryRun = true,
  confirmation = '',
  projectId = resolveFirebaseAdminProjectId(),
  authClient,
  firestoreClient,
} = {}) {
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`[staff-identity-migration] Refusing project ${projectId}; expected ${EXPECTED_PROJECT_ID}.`);
  }
  if (!dryRun && confirmation !== EXECUTE_CONFIRMATION) {
    throw new Error('[staff-identity-migration] Write mode requires the exact explicit confirmation token.');
  }

  initializeFirebaseAdmin(admin, projectId);
  const db = firestoreClient || admin.firestore();
  const auth = authClient || admin.auth();

  console.log(`[staff-identity-migration] Starting legacy staff identity audit (dryRun: ${dryRun})...`);

  const usersSnap = await db.collection('users').get();
  const existingUserUids = new Set(usersSnap.docs.map((doc) => doc.id));
  const existingEmailToUid = new Map();
  for (const doc of usersSnap.docs) {
    const email = normalizeEmail(doc.data().email);
    if (email && !existingEmailToUid.has(email)) existingEmailToUid.set(email, doc.id);
  }

  const sourceCollections = ['technicians', 'hrProfiles'];
  const candidates = [];
  const conflicts = [];
  let duplicatesSkipped = 0;
  const sourceCounts = { technicians: 0, hrProfiles: 0 };

  for (const source of sourceCollections) {
    const snap = await db.collection(source).get();
    sourceCounts[source] = snap.size;

    for (const legacyDoc of snap.docs) {
      const uid = legacyDoc.id;
      const sourceData = legacyDoc.data() || {};
      const sourceEmail = normalizeEmail(sourceData.email);

      if (existingUserUids.has(uid)) {
        duplicatesSkipped += 1;
        continue;
      }

      const mappedEmailUid = sourceEmail ? existingEmailToUid.get(sourceEmail) : undefined;
      if (mappedEmailUid && mappedEmailUid !== uid) {
        conflicts.push({ source, uid, code: 'EMAIL_ALREADY_BOUND_TO_DIFFERENT_UID', existingUid: mappedEmailUid });
        continue;
      }

      const authIdentity = await authIdentityFor(auth, uid);
      if (!authIdentity.exists) {
        conflicts.push({ source, uid, code: 'AUTH_USER_MISSING' });
        continue;
      }
      if (authIdentity.disabled) {
        conflicts.push({ source, uid, code: 'AUTH_USER_DISABLED' });
        continue;
      }

      const authEmail = normalizeEmail(authIdentity.email);
      if (sourceEmail && authEmail && sourceEmail !== authEmail) {
        conflicts.push({ source, uid, code: 'AUTH_PROFILE_EMAIL_MISMATCH' });
        continue;
      }

      candidates.push({
        source,
        uid,
        profile: buildCanonicalProfile({ uid, source, sourceData, authIdentity }),
      });
    }
  }

  let identitiesMigrated = 0;

  if (!dryRun && candidates.length > 0) {
    for (let offset = 0; offset < candidates.length; offset += BATCH_PROFILE_LIMIT) {
      const chunk = candidates.slice(offset, offset + BATCH_PROFILE_LIMIT);
      const batch = db.batch();

      for (const candidate of chunk) {
        const userRef = db.collection('users').doc(candidate.uid);
        const auditRef = db.collection('audit_logs').doc();
        batch.set(userRef, candidate.profile, { merge: true });
        batch.set(auditRef, {
          action: 'LEGACY_STAFF_IDENTITY_MIGRATED',
          actor: 'SYSTEM_MIGRATION',
          targetUid: candidate.uid,
          sourceCollection: candidate.source,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
      identitiesMigrated += chunk.length;
    }
  }

  const summary = {
    dryRun,
    projectId,
    totalExistingUsers: existingUserUids.size,
    technicianProfilesFound: sourceCounts.technicians,
    hrProfilesFound: sourceCounts.hrProfiles,
    candidatesReadyForMigration: dryRun ? candidates.length : Math.max(0, candidates.length - identitiesMigrated),
    identitiesMigrated,
    duplicatesSkipped,
    conflictsFound: conflicts.length,
    conflicts,
    status: conflicts.length > 0 ? 'REVIEW_REQUIRED' : 'SUCCESS',
  };

  console.log(`[staff-identity-migration] ${JSON.stringify(summary, null, 2)}`);
  return summary;
}

const isExecute = process.argv.includes('--execute');
const confirmationArg = process.argv.find((arg) => arg.startsWith('--confirm='));
const confirmation = confirmationArg ? confirmationArg.slice('--confirm='.length) : '';

migrateLegacyStaffIdentities({
  dryRun: !isExecute,
  confirmation,
}).catch((error) => {
  console.error('[staff-identity-migration] FAILED:', error);
  process.exit(1);
});

import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const submittedGeo = {
  lat: 24.222222,
  lng: 55.333333,
  address: 'Al Ain, UAE',
  emirate: 'Abu Dhabi',
  city: 'Al Ain',
  area: 'Central District',
  source: 'owner_submission',
  verified: false,
  verifiedBy: null,
  verifiedAt: null,
  requiresGeoReview: true,
  dispatchReady: false,
};

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

describe('Canonical property geo authority', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => testEnv.clearFirestore());
  after(async () => testEnv.cleanup());

  it('Owner and Admin browsers can submit unverified evidence but cannot create canonical geo', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_geo', { role: 'owner' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_geo', { admin: true, role: 'admin' }).firestore();
    await assertSucceeds(setDoc(doc(ownerDb, 'properties/submitted'), {
      ownerId: 'owner_geo', status: 'pending_admin_approval', name: 'Submitted Property', submittedGeo,
    }));
    await assertSucceeds(setDoc(doc(adminDb, 'properties/admin-submitted'), {
      ownerId: 'owner_geo', status: 'pending_admin_approval', name: 'Admin Submitted Property', submittedGeo,
    }));
    await assertFails(setDoc(doc(ownerDb, 'properties/forged-owner'), {
      ownerId: 'owner_geo', status: 'pending_admin_approval', geo: { ...submittedGeo, verified: true, dispatchReady: true },
    }));
    await assertFails(setDoc(doc(adminDb, 'properties/forged-admin'), {
      ownerId: 'owner_geo', status: 'pending_admin_approval', geo: { ...submittedGeo, verified: true, dispatchReady: true },
    }));
  });

  it('Owner and Admin browsers cannot mutate canonical geo while ordinary fields remain usable', async () => {
    await seed('properties/canonical', {
      ownerId: 'owner_geo', ownerUid: 'owner_geo', status: 'APPROVED', name: 'Canonical Property', submittedGeo,
      geo: { ...submittedGeo, source: 'admin_manual', verified: true, dispatchReady: true, requiresGeoReview: false, verifiedBy: 'founder', verifiedAt: 'server-time', verificationVersion: 1 },
      geoVerification: { state: 'VERIFIED', source: 'FOUNDER_MFA_REVIEW', verifiedBy: 'founder', verifiedAt: 'server-time', verificationVersion: 1 },
    });
    const ownerDb = testEnv.authenticatedContext('owner_geo', { role: 'owner' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_geo', { admin: true, role: 'admin' }).firestore();
    const ownerRef = doc(ownerDb, 'properties/canonical');
    const adminRef = doc(adminDb, 'properties/canonical');
    await assertFails(updateDoc(ownerRef, { geo: { ...submittedGeo, verified: true, dispatchReady: true } }));
    await assertFails(updateDoc(adminRef, { geoVerification: { state: 'VERIFIED', verifiedBy: 'admin_geo' } }));
    await assertSucceeds(updateDoc(ownerRef, { address: 'Owner ordinary correction, Al Ain' }));
    await assertSucceeds(updateDoc(adminRef, { adminReviewNote: 'Non-geo administrative correction.' }));
  });

  it('Owner may revise submitted evidence only while it remains explicitly unverified', async () => {
    await seed('properties/review-pending', {
      ownerId: 'owner_geo', ownerUid: 'owner_geo', status: 'pending_admin_approval', name: 'Review Pending', submittedGeo,
    });
    const ownerDb = testEnv.authenticatedContext('owner_geo', { role: 'owner' }).firestore();
    const ref = doc(ownerDb, 'properties/review-pending');
    await assertSucceeds(updateDoc(ref, { submittedGeo: { ...submittedGeo, area: 'Updated owner evidence' } }));
    await assertFails(updateDoc(ref, { submittedGeo: { ...submittedGeo, verified: true, dispatchReady: true, requiresGeoReview: false } }));
  });
});

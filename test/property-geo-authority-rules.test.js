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

  it('Owner can submit unverified geo evidence but cannot create a verified canonical pin', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_geo', { role: 'owner' }).firestore();
    await assertSucceeds(setDoc(doc(ownerDb, 'properties/submitted'), {
      ownerId: 'owner_geo',
      status: 'pending_admin_approval',
      name: 'Submitted Property',
      submittedGeo,
    }));
    await assertFails(setDoc(doc(ownerDb, 'properties/forged-canonical'), {
      ownerId: 'owner_geo',
      status: 'pending_admin_approval',
      name: 'Forged Property',
      geo: { ...submittedGeo, verified: true, dispatchReady: true, requiresGeoReview: false, verifiedBy: 'owner_geo' },
    }));
    await assertFails(setDoc(doc(ownerDb, 'properties/forged-submission'), {
      ownerId: 'owner_geo',
      status: 'pending_admin_approval',
      name: 'Forged Submission',
      submittedGeo: { ...submittedGeo, verified: true, dispatchReady: true, requiresGeoReview: false },
    }));
  });

  it('Owner and Admin browsers cannot mutate canonical geo, while ordinary fields remain usable', async () => {
    await seed('properties/canonical', {
      ownerId: 'owner_geo',
      ownerUid: 'owner_geo',
      status: 'APPROVED',
      name: 'Canonical Property',
      submittedGeo,
      geo: { ...submittedGeo, source: 'admin_manual', verified: true, dispatchReady: true, requiresGeoReview: false, verifiedBy: 'founder', verifiedAt: 'server-time' },
      geoVerification: { state: 'VERIFIED', verifiedBy: 'founder' },
    });
    const ownerDb = testEnv.authenticatedContext('owner_geo', { role: 'owner' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_geo', { admin: true, role: 'admin' }).firestore();
    const refOwner = doc(ownerDb, 'properties/canonical');
    const refAdmin = doc(adminDb, 'properties/canonical');

    await assertFails(updateDoc(refOwner, { geo: { ...submittedGeo, verified: true, dispatchReady: true } }));
    await assertFails(updateDoc(refOwner, { geoVerification: { state: 'VERIFIED', verifiedBy: 'owner_geo' } }));
    await assertFails(updateDoc(refAdmin, { geo: { ...submittedGeo, verified: true, dispatchReady: true, verifiedBy: 'admin_geo' } }));
    await assertSucceeds(updateDoc(refOwner, { name: 'Owner-updated ordinary property name' }));
    await assertSucceeds(updateDoc(refAdmin, { adminReviewNote: 'Non-geo administrative correction.' }));
  });

  it('Owner can revise submitted evidence only while it remains explicitly unverified', async () => {
    await seed('properties/review-pending', {
      ownerId: 'owner_geo',
      ownerUid: 'owner_geo',
      status: 'pending_admin_approval',
      name: 'Review Pending',
      submittedGeo,
    });
    const ownerDb = testEnv.authenticatedContext('owner_geo', { role: 'owner' }).firestore();
    const ref = doc(ownerDb, 'properties/review-pending');
    await assertSucceeds(updateDoc(ref, {
      submittedGeo: { ...submittedGeo, area: 'Updated owner evidence' },
      address: 'Updated owner evidence, Al Ain',
    }));
    await assertFails(updateDoc(ref, {
      submittedGeo: { ...submittedGeo, verified: true, dispatchReady: true, requiresGeoReview: false },
    }));
  });
});

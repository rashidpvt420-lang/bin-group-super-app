// N-12 / N-13 regressions (Firestore rules).
// N-12: any signed-in user could create owners/{uid} already marked verified / kycVerified,
//       and an Owner could set verified / trustScore (or delete dashboardLocked) on its own profile.
// N-13: an Owner could forge pricingAuditLogs entries about itself.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const ctx = (uid, claims) => testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...claims }).firestore();
const seed = (path, data) => testEnv.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), path), data));
// Admin actors carry a verified second factor so the tests stay valid if Admin rules require MFA.
const adminClaims = { role: 'admin', admin: true, firebase: { sign_in_second_factor: 'phone' } };

describe('N-12 / N-13 Owner trust rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed('owners/owner_n12', {
      uid: 'owner_n12', role: 'owner', status: 'PENDING_PROPERTY_INSPECTION',
      verified: false, kycVerified: false, trustScore: 10, dashboardLocked: true,
      displayName: 'Owner N12', preferredLanguage: 'en',
    });
    await seed('pricingAuditLogs/log_existing', { ownerId: 'owner_n12', propertyId: 'p1', result: { annualPrice: 1725 } });
  });
  after(async () => testEnv.cleanup());

  // ---- N-12: create ----
  const forgedCreates = [
    { verified: true },
    { kycVerified: true },
    { isVerified: true },
    { identityVerified: true },
    { trustScore: 100 },
    { verifiedBy: 'self' },
    { adminApproved: true },
    { dashboardUnlocked: true },
    { paymentVerified: true },
  ];
  it('N-12: a new user cannot self-create a pre-verified or trusted owners profile', async () => {
    const db = ctx('new_owner', { role: 'owner' });
    for (const patch of forgedCreates) {
      await assertFails(setDoc(doc(db, 'owners/new_owner'), { uid: 'new_owner', role: 'owner', ...patch }));
    }
  });
  it('N-12 control: a plain own profile create is still allowed; cross-uid create is not', async () => {
    const db = ctx('new_owner', { role: 'owner' });
    await assertFails(setDoc(doc(db, 'owners/someone_else'), { uid: 'someone_else', role: 'owner' }));
    await assertSucceeds(setDoc(doc(db, 'owners/new_owner'), { uid: 'new_owner', role: 'owner', displayName: 'New Owner' }));
  });

  // ---- N-12: update ----
  const forgedUpdates = [
    { verified: true },
    { kycVerified: true },
    { trustScore: 100 },
    { trustLevel: 'GOLD' },
    { verificationStatus: 'VERIFIED' },
    { role: 'admin' },
    { status: 'ACTIVE' },
    { dashboardLocked: deleteField() },
    { dashboardLocked: false },
    { activeContractId: 'c_forged' },
  ];
  it('N-12: an Owner cannot set, change or delete trust/verification/activation keys on its own profile', async () => {
    const db = ctx('owner_n12', { role: 'owner' });
    for (const patch of forgedUpdates) {
      await assertFails(updateDoc(doc(db, 'owners/owner_n12'), patch));
    }
    let snap;
    await testEnv.withSecurityRulesDisabled(async (c) => { snap = (await getDoc(doc(c.firestore(), 'owners/owner_n12'))).data(); });
    if (snap.verified !== false || snap.trustScore !== 10 || snap.dashboardLocked !== true) throw new Error('owner trust fields were mutated');
  });
  it('N-12 control: an Owner can still edit non-authority profile fields; Admin keeps authority', async () => {
    const db = ctx('owner_n12', { role: 'owner' });
    await assertSucceeds(updateDoc(doc(db, 'owners/owner_n12'), { preferredLanguage: 'ar', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ctx('owner_other', { role: 'owner' }), 'owners/owner_n12'), { preferredLanguage: 'en' }));
    await assertSucceeds(updateDoc(doc(ctx('admin_n12', adminClaims), 'owners/owner_n12'), { verified: true, verifiedBy: 'admin_n12' }));
  });

  // ---- N-13 ----
  it('N-13: an Owner cannot forge, rewrite or delete pricing audit logs', async () => {
    const db = ctx('owner_n12', { role: 'owner' });
    await assertFails(setDoc(doc(db, 'pricingAuditLogs/forged'), { ownerId: 'owner_n12', propertyId: 'p1', result: { annualPrice: 1 }, createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'pricingAuditLogs/log_existing'), { result: { annualPrice: 1 } }));
    await assertFails(deleteDoc(doc(db, 'pricingAuditLogs/log_existing')));
  });
  it('N-13 control: the Owner can still read its own pricing audit log; others cannot', async () => {
    await assertSucceeds(getDoc(doc(ctx('owner_n12', { role: 'owner' }), 'pricingAuditLogs/log_existing')));
    await assertFails(getDoc(doc(ctx('owner_other', { role: 'owner' }), 'pricingAuditLogs/log_existing')));
  });
});

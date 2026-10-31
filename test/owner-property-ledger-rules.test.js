// Own-data rules for every source the per-property owner ledger joins: an owner reads only their own rows.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const A = 'ledger_owner_a';
const B = 'ledger_owner_b';
describe('owner property ledger source rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'bin-group-57c60', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'rent_installments/r1'), { propertyId: 'p1', ownerId: A, ownerUid: A, amount: 1, status: 'PAID' });
      await setDoc(doc(c.firestore(), 'owner_approval_requests/q1'), { propertyId: 'p1', ownerId: A, decision: 'APPROVED' });
    });
  });
  after(async () => testEnv.cleanup());
  const as = (uid) => testEnv.authenticatedContext(uid, { role: 'owner', email: `${uid}@example.com`, email_verified: true }).firestore();

  it('the owning owner can read their rent rows and approved quotes', async () => {
    await assertSucceeds(getDoc(doc(as(A), 'rent_installments/r1')));
    await assertSucceeds(getDoc(doc(as(A), 'owner_approval_requests/q1')));
  });
  it('another owner and guests cannot read them, and nobody can write them', async () => {
    await assertFails(getDoc(doc(as(B), 'rent_installments/r1')));
    await assertFails(getDoc(doc(as(B), 'owner_approval_requests/q1')));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'rent_installments/r1')));
    await assertFails(setDoc(doc(as(A), 'rent_installments/r1'), { status: 'PAID', amount: 999 }));
    await assertFails(setDoc(doc(as(A), 'owner_approval_requests/q1'), { decision: 'APPROVED' }, { merge: true }));
  });
});

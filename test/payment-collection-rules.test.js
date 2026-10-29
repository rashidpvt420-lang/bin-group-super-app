// PR D: payment_collection_records/voids/audit are server-written and immutable from every
// client (admins included). Payers read only their own records; proofs live in Storage under
// payment-collections/{payerUid}/ and only the payer (or an MFA admin) can read them.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getBytes, ref, uploadString } from 'firebase/storage';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };

describe('payment collection record rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
      storage: { rules: fs.readFileSync('storage.rules', 'utf8') },
    });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'payment_collection_records/r1'), { payerUid: 'payer_a', amount: 100, method: 'cash' });
      await setDoc(doc(db, 'payment_collection_voids/r1'), { payerUid: 'payer_a', reason: 'wrong contract entry' });
      await setDoc(doc(db, 'payment_collection_audit/a1'), { recordId: 'r1', payerUid: 'payer_a' });
      await uploadString(ref(context.storage(), 'payment-collections/payer_a/r1/proof.pdf'), '%PDF-1.4 proof');
    });
  });
  after(async () => testEnv.cleanup());

  const userDb = (uid, role = 'owner') => testEnv.authenticatedContext(uid, { role }).firestore();
  const admin = () => testEnv.authenticatedContext('pc_admin', { role: 'admin', admin: true, email_verified: true, ...MFA });

  it('payer reads only their own record and void entry', async () => {
    await assertSucceeds(getDoc(doc(userDb('payer_a'), 'payment_collection_records/r1')));
    await assertSucceeds(getDoc(doc(userDb('payer_a'), 'payment_collection_voids/r1')));
    await assertFails(getDoc(doc(userDb('payer_b'), 'payment_collection_records/r1')));
    await assertFails(getDoc(doc(userDb('payer_b', 'tenant'), 'payment_collection_voids/r1')));
    await assertFails(getDoc(doc(userDb('payer_a'), 'payment_collection_audit/a1')));
  });

  it('nobody, admins included, can create, edit or delete records from a client', async () => {
    for (const db of [userDb('payer_a'), admin().firestore()]) {
      await assertFails(setDoc(doc(db, 'payment_collection_records/r2'), { payerUid: 'payer_a', amount: 1 }));
      await assertFails(updateDoc(doc(db, 'payment_collection_records/r1'), { amount: 1 }));
      await assertFails(deleteDoc(doc(db, 'payment_collection_records/r1')));
      await assertFails(updateDoc(doc(db, 'payment_collection_voids/r1'), { reason: 'changed reason text' }));
      await assertFails(deleteDoc(doc(db, 'payment_collection_audit/a1')));
    }
  });

  it('proof is readable by the payer only (plus MFA admin), never writable by clients', async () => {
    await assertSucceeds(getBytes(ref(testEnv.authenticatedContext('payer_a', { role: 'owner' }).storage(), 'payment-collections/payer_a/r1/proof.pdf')));
    await assertFails(getBytes(ref(testEnv.authenticatedContext('payer_b', { role: 'owner' }).storage(), 'payment-collections/payer_a/r1/proof.pdf')));
    await assertFails(uploadString(ref(testEnv.authenticatedContext('payer_a', { role: 'owner' }).storage(), 'payment-collections/payer_a/r9/proof.pdf'), 'x'));
    await assertFails(uploadString(ref(admin().storage(), 'payment-collections/payer_a/r9/proof.pdf'), 'x'));
  });
});

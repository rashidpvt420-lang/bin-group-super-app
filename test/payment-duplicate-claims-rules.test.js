// Duplicate-payment claims are server-only; finance fraud alerts are admin-read-only.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const ADMIN = { role: 'admin', admin: true, email: 'admin-dup@example.com', email_verified: true };
const USER = 'dup_owner_a';

describe('payment_collection_claims / finance_fraud_alerts rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'bin-group-57c60', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'payment_collection_claims/c1'), { recordId: 'r1', payerUid: USER, kind: 'cheque' });
      await setDoc(doc(c.firestore(), 'finance_fraud_alerts/a1'), { type: 'DUPLICATE_PAYMENT_COLLECTION', payerUid: USER, status: 'open' });
    });
  });
  after(async () => testEnv.cleanup());
  const userDb = () => testEnv.authenticatedContext(USER, { email: 'o@example.com', email_verified: true }).firestore();
  const adminDb = () => testEnv.authenticatedContext('admin_dup', { ...ADMIN, ...MFA }).firestore();

  it('no client can create, edit or delete a duplicate claim, admins included', async () => {
    for (const db of [userDb(), adminDb()]) {
      await assertFails(setDoc(doc(db, 'payment_collection_claims/c2'), { recordId: 'x' }));
      await assertFails(updateDoc(doc(db, 'payment_collection_claims/c1'), { recordId: 'x' }));
      await assertFails(deleteDoc(doc(db, 'payment_collection_claims/c1')));
    }
    await assertFails(getDoc(doc(userDb(), 'payment_collection_claims/c1')));
  });

  it('fraud alerts are readable by admins only and never writable by clients', async () => {
    await assertSucceeds(getDoc(doc(adminDb(), 'finance_fraud_alerts/a1')));
    await assertFails(getDoc(doc(userDb(), 'finance_fraud_alerts/a1')));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'finance_fraud_alerts/a1')));
    for (const db of [userDb(), adminDb()]) {
      await assertFails(setDoc(doc(db, 'finance_fraud_alerts/a2'), { type: 'forged' }));
      await assertFails(updateDoc(doc(db, 'finance_fraud_alerts/a1'), { status: 'closed' }));
      await assertFails(deleteDoc(doc(db, 'finance_fraud_alerts/a1')));
    }
  });
});

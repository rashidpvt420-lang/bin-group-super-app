// payout_change_alerts are server-only: admins read, holders read their own, nobody writes.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
describe('payout_change_alerts rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'bin-group-57c60', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'payout_change_alerts/a1'), { holderUid: 'pc_owner', status: 'OPEN', kind: 'CHANGED' });
    });
  });
  after(async () => testEnv.cleanup());
  const as = (uid, extra = {}) => testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...extra }).firestore();
  const adminDb = () => as('pc_admin', { role: 'admin', admin: true, ...MFA });

  it('admin and holder can read; others cannot', async () => {
    await assertSucceeds(getDoc(doc(adminDb(), 'payout_change_alerts/a1')));
    await assertSucceeds(getDoc(doc(as('pc_owner', { role: 'owner' }), 'payout_change_alerts/a1')));
    await assertFails(getDoc(doc(as('pc_other', { role: 'owner' }), 'payout_change_alerts/a1')));
  });
  it('nobody can create, dismiss or delete an alert from a client', async () => {
    for (const db of [adminDb(), as('pc_owner', { role: 'owner' })]) {
      await assertFails(setDoc(doc(db, 'payout_change_alerts/a2'), { holderUid: 'pc_owner' }));
      await assertFails(updateDoc(doc(db, 'payout_change_alerts/a1'), { status: 'DISMISSED' }));
      await assertFails(deleteDoc(doc(db, 'payout_change_alerts/a1')));
    }
  });
});

// pdc_cheques are server-only: admins read all, owners read their own, nobody writes.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
describe('pdc_cheques rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'bin-group-57c60', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'pdc_cheques/L1'), { ownerId: 'pdc_o', tenantUid: 'pdc_t', status: 'BOUNCED' });
    });
  });
  after(async () => testEnv.cleanup());
  const as = (uid, extra = {}) => testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...extra }).firestore();
  const adminDb = () => as('pdc_admin', { role: 'admin', admin: true, ...MFA });

  it('admin and owning owner read; another owner cannot', async () => {
    await assertSucceeds(getDoc(doc(adminDb(), 'pdc_cheques/L1')));
    await assertSucceeds(getDoc(doc(as('pdc_o', { role: 'owner' }), 'pdc_cheques/L1')));
    await assertFails(getDoc(doc(as('pdc_x', { role: 'owner' }), 'pdc_cheques/L1')));
  });
  it('no client can create, change status or delete a cheque record', async () => {
    for (const db of [adminDb(), as('pdc_o', { role: 'owner' }), as('pdc_t', { role: 'tenant' })]) {
      await assertFails(setDoc(doc(db, 'pdc_cheques/L2'), { ownerId: 'pdc_o', status: 'CLEARED' }));
      await assertFails(updateDoc(doc(db, 'pdc_cheques/L1'), { status: 'CLEARED' }));
      await assertFails(deleteDoc(doc(db, 'pdc_cheques/L1')));
    }
  });
});

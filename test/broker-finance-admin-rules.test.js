// Finance Admin broker payout review (Rashid, 18 Nov 2026): an explicit finance_admin that holds the
// 'broker' module and an MFA session may READ broker document metadata; nobody else gains access, no
// write is opened, and the named second approver is never treated as a Finance approver.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' } };
const FINANCE_ADMIN = { role: 'finance_admin', finance_admin: true, modules: ['dashboard', 'financials', 'transactions', 'broker'], ...MFA };

describe('broker documents for a broker-module Finance Admin', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'bin-group-57c60', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await setDoc(doc(db, 'brokerDocuments/d1'), { brokerId: 'broker1', docType: 'rera_license', status: 'PENDING_REVIEW', storagePath: 'brokerDocuments/broker1/rera_license/x.pdf' });
      await setDoc(doc(db, 'broker_payout_requests/p1'), { brokerId: 'broker1', status: 'PENDING', amount: 100 });
      for (const uid of ['fa', 'fa_nobroker', 'fa_suspended', 'fs', 'fm', 'sa2']) {
        await setDoc(doc(db, `users/${uid}`), { uid, status: uid === 'fa_suspended' ? 'suspended' : 'active' });
      }
    });
  });
  after(async () => testEnv.cleanup());
  const as = (uid, claims) => testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...claims }).firestore();

  it('a finance_admin with the broker module and MFA can read broker document metadata', async () => {
    await assertSucceeds(getDoc(doc(as('fa', FINANCE_ADMIN), 'brokerDocuments/d1')));
  });

  it('without the broker module, without MFA, or while suspended the read is refused', async () => {
    await assertFails(getDoc(doc(as('fa_nobroker', { ...FINANCE_ADMIN, modules: ['dashboard', 'financials', 'transactions'] }), 'brokerDocuments/d1')));
    const { firebase, ...noMfa } = FINANCE_ADMIN;
    await assertFails(getDoc(doc(as('fa', noMfa), 'brokerDocuments/d1')));
    await assertFails(getDoc(doc(as('fa_suspended', FINANCE_ADMIN), 'brokerDocuments/d1')));
  });

  it('no other Finance or staff role gains broker document access, even with the module claim', async () => {
    await assertFails(getDoc(doc(as('fs', { role: 'finance_staff', modules: ['broker'], ...MFA }), 'brokerDocuments/d1')));
    await assertFails(getDoc(doc(as('fm', { role: 'finance_manager', finance_manager: true, modules: ['broker'], ...MFA }), 'brokerDocuments/d1')));
    await assertFails(getDoc(doc(as('fa', { ...FINANCE_ADMIN, role: 'operations_admin', finance_admin: false }), 'brokerDocuments/d1')));
  });

  it('the Finance Admin still cannot write, verify or delete broker documents', async () => {
    const db = as('fa', FINANCE_ADMIN);
    await assertFails(updateDoc(doc(db, 'brokerDocuments/d1'), { status: 'verified' }));
    await assertFails(deleteDoc(doc(db, 'brokerDocuments/d1')));
    await assertFails(setDoc(doc(db, 'brokerDocuments/d2'), { brokerId: 'broker1', docType: 'passport', status: 'PENDING_REVIEW' }));
  });

  it('the named second approver flag never confers Finance approver reads', async () => {
    const flagged = { role: 'finance_manager', finance_manager: true, designatedSecondApprover: true, ...MFA };
    await assertFails(getDoc(doc(as('sa2', flagged), 'broker_payout_requests/p1')));
    await assertFails(getDoc(doc(as('sa2', { ...FINANCE_ADMIN, designatedSecondApprover: true }), 'brokerDocuments/d1')));
    // The unflagged Finance approver keeps its existing payout-request read.
    await assertSucceeds(getDoc(doc(as('fm', { role: 'finance_manager', finance_manager: true, ...MFA }), 'broker_payout_requests/p1')));
  });
});

// Reopen counters and reopen events are server-only: no client can set reopenCount or forge an event.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const T = 'reopen_tenant';
describe('ticket reopen rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'bin-group-57c60', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'maintenanceTickets/t1'), { tenantId: T, status: 'COMPLETED', reopenCount: 2 });
      await setDoc(doc(c.firestore(), 'ticket_reopen_events/t1_1'), { ticketId: 't1', tenantId: T, reopenNumber: 1 });
    });
  });
  after(async () => testEnv.cleanup());
  const tenantDb = (uid = T) => testEnv.authenticatedContext(uid, { role: 'tenant', email: `${uid}@example.com`, email_verified: true }).firestore();
  const adminDb = () => testEnv.authenticatedContext('reopen_admin', { role: 'admin', admin: true, email: 'a@example.com', email_verified: true, ...MFA }).firestore();
  const dispatcherDb = () => testEnv.authenticatedContext('reopen_disp', { role: 'dispatcher', email: 'd@example.com', email_verified: true }).firestore();

  it('no client can reset or change reopenCount or force REOPENED', async () => {
    for (const db of [tenantDb(), adminDb(), dispatcherDb()]) {
      await assertFails(updateDoc(doc(db, 'maintenanceTickets/t1'), { reopenCount: 0 }));
      await assertFails(updateDoc(doc(db, 'maintenanceTickets/t1'), { status: 'REOPENED' }));
    }
  });
  it('reopen events: tenant reads own, admin reads, nobody writes', async () => {
    await assertSucceeds(getDoc(doc(tenantDb(), 'ticket_reopen_events/t1_1')));
    await assertSucceeds(getDoc(doc(adminDb(), 'ticket_reopen_events/t1_1')));
    await assertFails(getDoc(doc(tenantDb('reopen_other'), 'ticket_reopen_events/t1_1')));
    for (const db of [tenantDb(), adminDb()]) {
      await assertFails(setDoc(doc(db, 'ticket_reopen_events/t1_2'), { ticketId: 't1', tenantId: T }));
      await assertFails(updateDoc(doc(db, 'ticket_reopen_events/t1_1'), { reopenNumber: 0 }));
      await assertFails(deleteDoc(doc(db, 'ticket_reopen_events/t1_1')));
    }
  });
});

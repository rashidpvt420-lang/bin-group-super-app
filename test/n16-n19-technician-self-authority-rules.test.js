// N-16 / N-19 regressions (Firestore rules).
// N-16: a technician could create its own attendanceLogs rows (forged clock-in/out evidence).
// N-19: a technician could write users/{uid}.lastLocation and activeTicketId from the browser,
//       spoofing the location / active-job fields shown to Operations.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const ctx = (uid, claims) => testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...claims }).firestore();
const seed = (path, data) => testEnv.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), path), data));
const technician = () => ctx('tech_n16', { role: 'technician' });

describe('N-16 / N-19 technician self-authority rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed('users/tech_n16', { uid: 'tech_n16', role: 'technician', status: 'active', preferredLanguage: 'en' });
    await seed('attendanceLogs/log_own', { uid: 'tech_n16', staffId: 'tech_n16', type: 'CLOCK_IN', at: '2026-09-29T05:00:00Z' });
  });
  after(async () => testEnv.cleanup());

  it('N-16: a technician cannot author its own attendance evidence', async () => {
    const shapes = [
      { uid: 'tech_n16', type: 'CLOCK_IN', at: '2026-09-30T05:00:00Z' },
      { staffId: 'tech_n16', type: 'CLOCK_OUT', status: 'submitted' },
      { technicianId: 'tech_n16', hours: 12, status: 'pending_hr_review' },
      { userId: 'tech_n16', createdAt: serverTimestamp() },
    ];
    for (const shape of shapes) await assertFails(addDoc(collection(technician(), 'attendanceLogs'), shape));
    await assertFails(updateDoc(doc(technician(), 'attendanceLogs/log_own'), { at: '2026-09-29T04:00:00Z' }));
  });
  it('N-16 control: the technician still reads its own attendance; HR/Ops still record attendance', async () => {
    await assertSucceeds(getDoc(doc(technician(), 'attendanceLogs/log_own')));
    await assertFails(getDoc(doc(ctx('tech_other', { role: 'technician' }), 'attendanceLogs/log_own')));
    await assertSucceeds(addDoc(collection(ctx('hr_n16', { role: 'hr_staff' }), 'attendanceLogs'), { uid: 'tech_n16', type: 'CLOCK_IN', recordedBy: 'hr_n16' }));
    await assertSucceeds(addDoc(collection(ctx('ops_n16', { role: 'operations_admin' }), 'attendanceLogs'), { uid: 'tech_n16', type: 'CLOCK_OUT', recordedBy: 'ops_n16' }));
  });

  it('N-19: a technician cannot write lastLocation or activeTicketId on its own users doc', async () => {
    await assertFails(updateDoc(doc(technician(), 'users/tech_n16'), { lastLocation: { lat: 25.2, lng: 55.3 } }));
    await assertFails(updateDoc(doc(technician(), 'users/tech_n16'), { activeTicketId: 'ticket_forged' }));
    await assertFails(updateDoc(doc(technician(), 'users/tech_n16'), { lastLocation: { lat: 25.2, lng: 55.3 }, activeTicketId: 'ticket_forged', updatedAt: serverTimestamp() }));
  });
  it('N-19 control: allowed self-profile fields (language, lastSeenAt) still update', async () => {
    await assertSucceeds(updateDoc(doc(technician(), 'users/tech_n16'), { preferredLanguage: 'ar', lastSeenAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
});

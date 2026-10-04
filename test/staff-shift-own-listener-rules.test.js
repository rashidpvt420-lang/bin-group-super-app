import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import fs from 'node:fs';

// Regression: StaffTodayDashboard listens to staff_shifts/SHIFT_<uid>_<dubai date>
// before Clock In creates it. The old rule dereferenced resource.data on a
// missing document, denied the listener ("Missing or insufficient
// permissions") and the terminated listener never showed the ACTIVE shift.
const TECH = 'koFjPljsrCQ2p8uMIwRDJ2fhKth2';
const OTHER = 'otherStaffUid0000000000000001';
const TODAY = '2026-10-04';
const ownShift = (uid, date = TODAY) => `staff_shifts/SHIFT_${uid}_${date}`;

let testEnv;

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

function techDb(uid = TECH, claims = { role: 'technician' }) {
  return testEnv.authenticatedContext(uid, claims).firestore();
}

describe('staff_shifts own-shift listener rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed(`users/${TECH}`, { role: 'technician', status: 'active', email: 'technician@bin-groups.com' });
    await seed(`users/${OTHER}`, { role: 'technician', status: 'active' });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('staff can get their own not-yet-created shift for any Dubai date key', async () => {
    const snap = await assertSucceeds(getDoc(doc(techDb(), ownShift(TECH))));
    assert.strictEqual(snap.exists(), false);
    await assertSucceeds(getDoc(doc(techDb(), ownShift(TECH, '2027-01-31'))));
  });

  it('own-shift listener attached before Clock In receives the server-created ACTIVE shift', async () => {
    const db = techDb();
    const states = [];
    let unsubscribe;
    const sawActive = new Promise((resolve, reject) => {
      unsubscribe = onSnapshot(
        doc(db, ownShift(TECH)),
        (snap) => {
          states.push(snap.exists() ? snap.data().status : 'MISSING');
          if (snap.exists() && snap.data().status === 'ACTIVE') resolve();
        },
        reject,
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    // submitStaffQuickAction(CLOCK_IN) writes this document with the Admin SDK.
    await seed(ownShift(TECH), { staffId: TECH, status: 'ACTIVE', shiftDate: TODAY });
    await sawActive;
    unsubscribe();
    assert.deepStrictEqual(states, ['MISSING', 'ACTIVE']);
  });

  it('staff can get their own existing shift', async () => {
    await seed(ownShift(TECH), { staffId: TECH, status: 'ACTIVE', shiftDate: TODAY });
    const snap = await assertSucceeds(getDoc(doc(techDb(), ownShift(TECH))));
    assert.strictEqual(snap.data().status, 'ACTIVE');
  });

  it('staff cannot read another staff member shift whether missing or existing', async () => {
    await assertFails(getDoc(doc(techDb(), ownShift(OTHER))));
    await seed(ownShift(OTHER), { staffId: OTHER, status: 'ACTIVE', shiftDate: TODAY });
    await assertFails(getDoc(doc(techDb(), ownShift(OTHER))));
    // A document under the caller's id pattern that is bound to someone else stays private.
    await seed(ownShift(TECH, '2026-10-05'), { staffId: OTHER, status: 'ACTIVE' });
    await assertFails(getDoc(doc(techDb(), ownShift(TECH, '2026-10-05'))));
  });

  it('malformed or prefix-spoofed missing shift ids are denied', async () => {
    for (const id of [
      `SHIFT_${TECH}_2026-10-4`,
      `SHIFT_${TECH}_2026-10-04x`,
      `SHIFT_${TECH}_extra_2026-10-04`,
      `SHIFT_${TECH}x_2026-10-04`,
      `SHIFT_${TECH}`,
      `${TECH}_2026-10-04`,
      `SUMMARY_${TECH}_2026-10-04`,
    ]) {
      await assertFails(getDoc(doc(techDb(), `staff_shifts/${id}`)));
    }
    // Short uid that is a prefix of a longer id must not match.
    await assertFails(getDoc(doc(techDb('kofj'), `staff_shifts/SHIFT_kofjX_${TODAY}`)));
  });

  it('suspended and signed-out callers cannot probe shift ids', async () => {
    await seed(`users/${TECH}`, { role: 'technician', status: 'suspended', suspended: true });
    await assertFails(getDoc(doc(techDb(), ownShift(TECH))));
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, ownShift(TECH))));
  });

  it('browser writes stay server-only and list access stays staffId-bound', async () => {
    await assertFails(setDoc(doc(techDb(), ownShift(TECH)), { staffId: TECH, status: 'ACTIVE' }));
    await seed(ownShift(TECH), { staffId: TECH, status: 'ACTIVE' });
    await seed(ownShift(OTHER), { staffId: OTHER, status: 'ACTIVE' });
    const own = await assertSucceeds(getDocs(query(collection(techDb(), 'staff_shifts'), where('staffId', '==', TECH))));
    assert.strictEqual(own.size, 1);
    await assertFails(getDocs(collection(techDb(), 'staff_shifts')));
    await assertFails(getDocs(query(collection(techDb(), 'staff_shifts'), where('staffId', '==', OTHER))));
  });

  it('HR keeps read access to existing shifts', async () => {
    await seed(ownShift(OTHER), { staffId: OTHER, status: 'ACTIVE' });
    const hrDb = testEnv.authenticatedContext('hr_user', { role: 'hr_manager' }).firestore();
    await seed('users/hr_user', { role: 'hr_manager', status: 'active' });
    await assertSucceeds(getDoc(doc(hrDb, ownShift(OTHER))));
  });
});

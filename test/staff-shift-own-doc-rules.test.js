// Regression for the Technician TODAY banner "Shift sync failed: Missing or insufficient
// permissions." (production, 2026-09-30 20:51 GST). StaffTodayDashboard listens to
// staff_shifts/SHIFT_<uid>_<yyyy-mm-dd>. Before Clock In that doc does not exist, so a rule
// that only checks resource.data.staffId denies the get (resource == null) and the Firestore
// SDK terminates the listener; the header then stays OFF DUTY even after Clock In succeeds.
// To check the live rules, run it in a scratch checkout whose firestore.rules is the deployed
// copy (e.g. `git show bb4df313:firestore.rules > firestore.rules`) with
// EXPECT_MISSING_OWN_SHIFT=deny to pin the production behaviour.
import { describe, it, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const RULES_FILE = 'firestore.rules';
const LIVE_DENY = process.env.EXPECT_MISSING_OWN_SHIFT === 'deny';
let testEnv;

const tech = 'techActiveUid01';
const other = 'techOtherUid02';
const today = '2026-09-30';
const activeProfile = {
  role: 'technician', userRole: 'technician', primaryRole: 'technician',
  status: 'ACTIVE', approvalStatus: 'APPROVED', suspended: false,
};
const activeClaims = { role: 'technician', userRole: 'technician', primaryRole: 'technician', technician: true, suspended: false };

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

describe(`staff_shifts / staff_daily_summaries own-doc reads (${RULES_FILE})`, () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-bin-staff-shift-own-doc',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    for (const uid of [tech, other]) {
      await seed(`users/${uid}`, activeProfile);
      await seed(`technicians/${uid}`, activeProfile);
    }
  });

  after(async () => {
    await testEnv.cleanup();
  });

  const fs_ = (uid = tech, claims = activeClaims) => testEnv.authenticatedContext(uid, claims).firestore();

  it(LIVE_DENY
    ? 'LIVE: denies an ACTIVE technician reading their own not-yet-created shift doc (the production banner)'
    : 'allows an ACTIVE technician to read their own not-yet-created shift doc (before Clock In)', async () => {
    const read = getDoc(doc(fs_(), 'staff_shifts', `SHIFT_${tech}_${today}`));
    await (LIVE_DENY ? assertFails(read) : assertSucceeds(read));
  });

  it('allows reading the own shift doc once Clock In has created it (live and fixed)', async () => {
    await seed(`staff_shifts/SHIFT_${tech}_${today}`, { staffId: tech, status: 'ACTIVE', shiftDate: today });
    await assertSucceeds(getDoc(doc(fs_(), 'staff_shifts', `SHIFT_${tech}_${today}`)));
  });

  it('still denies another technician\'s shift doc, existing or missing', async () => {
    await seed(`staff_shifts/SHIFT_${other}_${today}`, { staffId: other, status: 'ACTIVE', shiftDate: today });
    await assertFails(getDoc(doc(fs_(), 'staff_shifts', `SHIFT_${other}_${today}`)));
    await assertFails(getDoc(doc(fs_(), 'staff_shifts', `SHIFT_${other}_2026-10-01`)));
  });

  it('does not accept look-alike ids (suffix / prefix / non-date) for a missing doc', async () => {
    for (const id of [`SHIFT_${tech}_${today}_x`, `XSHIFT_${tech}_${today}`, `SHIFT_${tech}_today`, `SHIFT_${tech}X_${today}`]) {
      await assertFails(getDoc(doc(fs_(), 'staff_shifts', id)));
    }
  });

  it('denies a suspended account even for its own shift id', async () => {
    const suspended = fs_(tech, { ...activeClaims, suspended: true });
    await assertFails(getDoc(doc(suspended, 'staff_shifts', `SHIFT_${tech}_${today}`)));
  });

  it('lets the technician read their own hrProfiles doc (HR shift schedule source), not another\'s', async () => {
    await seed(`hrProfiles/${tech}`, { uid: tech, shiftName: 'Day Shift', workingHours: '8 AM - 4 PM', offDay: 'Friday' });
    await seed(`hrProfiles/${other}`, { uid: other, shiftName: 'Night Shift' });
    await assertSucceeds(getDoc(doc(fs_(), 'hrProfiles', tech)));
    await assertFails(getDoc(doc(fs_(), 'hrProfiles', other)));
  });

  it('keeps staff_shifts browser-write denied', async () => {
    await assertFails(setDoc(doc(fs_(), 'staff_shifts', `SHIFT_${tech}_${today}`), { staffId: tech, status: 'ACTIVE' }));
  });

  it(LIVE_DENY
    ? 'LIVE: denies the own not-yet-created daily summary doc'
    : 'allows the own not-yet-created daily summary doc and denies another staff member\'s', async () => {
    const own = getDoc(doc(fs_(), 'staff_daily_summaries', `SUMMARY_${tech}_${today}`));
    await (LIVE_DENY ? assertFails(own) : assertSucceeds(own));
    await assertFails(getDoc(doc(fs_(), 'staff_daily_summaries', `SUMMARY_${other}_${today}`)));
  });
});

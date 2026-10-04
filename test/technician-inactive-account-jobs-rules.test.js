// Regression for the FIELD NODE "Assigned jobs could not be loaded" report (2026-09-30).
// The production Technician account had Auth claims { role: 'technician', suspended: true }
// and technicians/{uid} { status: 'EMAIL_VERIFIED', approvalStatus: 'PENDING', suspended: true }
// because HR onboarding activation was never completed. The TechnicianJobsPage query is a
// single-field equality on assignedTechnicianId (no composite index involved); these tests pin
// that the rules deny it for that account state and allow it once activation completes.
// For a like-for-like check against the live rules, run it in a scratch checkout whose
// firestore.rules is the deployed copy (e.g. `git show bb4df313:firestore.rules > firestore.rules`).
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';

const RULES_FILE = 'firestore.rules';
let testEnv;

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

const pendingProfile = {
  role: 'technician', userRole: 'technician', primaryRole: 'technician',
  status: 'EMAIL_VERIFIED', approvalStatus: 'PENDING', suspended: true,
};
const activeProfile = {
  role: 'technician', userRole: 'technician', primaryRole: 'technician',
  status: 'ACTIVE', approvalStatus: 'APPROVED', suspended: false,
};
const pendingClaims = { role: 'technician', userRole: 'technician', primaryRole: 'technician', technician: true, suspended: true };
const activeClaims = { ...pendingClaims, suspended: false };

const jobsQuery = (firestore, uid) => query(
  collection(firestore, 'maintenanceTickets'),
  where('assignedTechnicianId', '==', uid),
);

describe(`Technician jobs query vs account activation state (${RULES_FILE})`, () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-bin-technician-inactive-jobs',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed('maintenanceTickets/assigned_pending', { assignedTechnicianId: 'tech_pending', status: 'ASSIGNED' });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('denies the assigned-jobs query for a suspended, not-yet-activated Technician (production state)', async () => {
    await seed('users/tech_pending', pendingProfile);
    await seed('technicians/tech_pending', pendingProfile);
    const firestore = testEnv.authenticatedContext('tech_pending', pendingClaims).firestore();
    await assertFails(getDocs(jobsQuery(firestore, 'tech_pending')));
  });

  it('still denies when only the suspended claim is cleared but technicians/{uid} is PENDING', async () => {
    await seed('users/tech_pending', { ...pendingProfile, suspended: false });
    await seed('technicians/tech_pending', { ...pendingProfile, suspended: false });
    const firestore = testEnv.authenticatedContext('tech_pending', activeClaims).firestore();
    await assertFails(getDocs(jobsQuery(firestore, 'tech_pending')));
  });

  it('allows the same query once HR onboarding activation sets ACTIVE/APPROVED and clears suspended', async () => {
    await seed('users/tech_pending', { ...activeProfile, status: 'active' });
    await seed('technicians/tech_pending', activeProfile);
    const firestore = testEnv.authenticatedContext('tech_pending', activeClaims).firestore();
    const snapshot = await assertSucceeds(getDocs(jobsQuery(firestore, 'tech_pending')));
    assert.deepEqual(snapshot.docs.map((entry) => entry.id), ['assigned_pending']);
  });

  it('allows an empty result for an active Technician with no assignments (ACTIVE ASSIGNMENTS (0) is then genuine)', async () => {
    await seed('users/tech_idle', { ...activeProfile, status: 'active' });
    await seed('technicians/tech_idle', activeProfile);
    const firestore = testEnv.authenticatedContext('tech_idle', activeClaims).firestore();
    const snapshot = await assertSucceeds(getDocs(jobsQuery(firestore, 'tech_idle')));
    assert.equal(snapshot.size, 0);
  });
});

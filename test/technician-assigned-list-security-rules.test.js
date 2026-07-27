import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';

let testEnv;

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

describe('Technician assignment-bound list rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-technician-assigned-list',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed('users/tech_a', { role: 'technician', status: 'active', suspended: false });
    await seed('technicians/tech_a', {
      uid: 'tech_a',
      role: 'technician',
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      suspended: false,
    });
    await seed('users/tech_b', { role: 'technician', status: 'active', suspended: false });
    await seed('technicians/tech_b', {
      uid: 'tech_b',
      role: 'technician',
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      suspended: false,
    });
    for (const collectionName of ['tickets', 'maintenanceTickets']) {
      await seed(`${collectionName}/assigned_a`, {
        assignedTechnicianId: 'tech_a',
        technicianId: 'tech_a',
        status: 'ASSIGNED',
      });
      await seed(`${collectionName}/assigned_b`, {
        assignedTechnicianId: 'tech_b',
        technicianId: 'tech_b',
        status: 'ASSIGNED',
      });
      await seed(`${collectionName}/open_pool`, {
        assignedTechnicianId: null,
        technicianId: null,
        status: 'OPEN',
      });
    }
  });

  after(async () => {
    await testEnv.cleanup();
  });

  for (const collectionName of ['tickets', 'maintenanceTickets']) {
    it(`${collectionName}: approved technician can list only their identity-bound assignments`, async () => {
      const techDb = testEnv.authenticatedContext('tech_a', { role: 'technician' }).firestore();
      const assignedQuery = query(
        collection(techDb, collectionName),
        where('assignedTechnicianId', '==', 'tech_a'),
      );
      const snapshot = await assertSucceeds(getDocs(assignedQuery));
      assert.deepEqual(snapshot.docs.map((entry) => entry.id), ['assigned_a']);
    });

    it(`${collectionName}: technician cannot list the collection or another technician's assignments`, async () => {
      const techDb = testEnv.authenticatedContext('tech_a', { role: 'technician' }).firestore();
      await assertFails(getDocs(collection(techDb, collectionName)));
      await assertFails(getDocs(query(
        collection(techDb, collectionName),
        where('assignedTechnicianId', '==', 'tech_b'),
      )));
    });
  }
});

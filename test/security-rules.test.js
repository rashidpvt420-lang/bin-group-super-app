import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'fs';

let testEnv;

describe('Firestore Security Rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "bin-group-57c60",
      firestore: {
        rules: fs.readFileSync("firestore.rules", "utf8"),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('properties read isolation: Owner A cannot read Owner B property', async () => {
    // Setup admin context to create property and propertyMembers
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'properties/prop_b'), { ownerId: 'owner_b' });
    await setDoc(doc(adminDb, 'propertyMembers/prop_b/members/owner_b'), { role: 'owner', active: true });

    // Owner A context
    const ownerADb = testEnv.authenticatedContext('owner_a').firestore();
    await assertFails(getDoc(doc(ownerADb, 'properties/prop_b')));
  });

  it('units read isolation: Tenant A cannot read Tenant B unit', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'units/unit_b'), { tenantId: 'tenant_b', propertyId: 'prop_b' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    await assertFails(getDoc(doc(tenantADb, 'units/unit_b')));
  });

  it('contracts activation protection: User cannot update contract to ACTIVE', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'contracts/contract_1'), { ownerId: 'owner_a', status: 'PENDING' });

    const ownerADb = testEnv.authenticatedContext('owner_a').firestore();
    await assertFails(updateDoc(doc(ownerADb, 'contracts/contract_1'), { status: 'ACTIVE' }));
  });

  it('payment transaction protection: User cannot create payment transaction with paymentVerified true', async () => {
    const ownerADb = testEnv.authenticatedContext('owner_a').firestore();
    await assertFails(setDoc(doc(ownerADb, 'payment_transactions/pay_1'), { ownerId: 'owner_a', paymentVerified: true }));
  });

  it('admin override: Admin can read all', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await assertSucceeds(getDoc(doc(adminDb, 'properties/prop_b')));
  });

  it('tenant ticket access: Tenant can read their own tickets', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'maintenanceTickets/ticket_1'), { tenantId: 'tenant_a' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    await assertSucceeds(getDoc(doc(tenantADb, 'maintenanceTickets/ticket_1')));
  });

  it('technician assigned-ticket access: Technician can read assigned tickets', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'maintenanceTickets/ticket_2'), { assignedTechnicianId: 'tech_a' });

    const techADb = testEnv.authenticatedContext('tech_a').firestore();
    await assertSucceeds(getDoc(doc(techADb, 'maintenanceTickets/ticket_2')));
  });
});

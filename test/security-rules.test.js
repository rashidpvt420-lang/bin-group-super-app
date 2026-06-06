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

  it('ticket update narrowing: Technician cannot reassign ticket to another technician', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'maintenanceTickets/ticket_3'), {
      assignedTechnicianId: 'tech_a',
      status: 'ASSIGNED',
      priority: 'NORMAL',
      paymentVerified: false,
    });

    const techADb = testEnv.authenticatedContext('tech_a').firestore();
    // Should FAIL: technician trying to self-reassign to a different technician
    await assertFails(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      assignedTechnicianId: 'tech_evil',
      updatedAt: new Date().toISOString(),
    }));
    // Should FAIL: technician trying to escalate their own priority
    await assertFails(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      priority: 'URGENT',
      updatedAt: new Date().toISOString(),
    }));
    // Should SUCCEED: technician updating only allowed status fields
    await assertSucceeds(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      status: 'IN_PROGRESS',
      updatedAt: new Date().toISOString(),
    }));
  });

  it('ticket update narrowing: Tenant cannot directly change ticket status', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'maintenanceTickets/ticket_4'), {
      tenantId: 'tenant_a',
      status: 'OPEN',
      priority: 'NORMAL',
    });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    // Should FAIL: tenant trying to update status directly (not an allowed evidence field)
    await assertFails(updateDoc(doc(tenantADb, 'maintenanceTickets/ticket_4'), {
      status: 'CLOSED',
      updatedAt: new Date().toISOString(),
    }));
    // Should SUCCEED: tenant uploading evidence photos (allowed by safeTenantEvidenceUpdate)
    await assertSucceeds(updateDoc(doc(tenantADb, 'maintenanceTickets/ticket_4'), {
      evidenceStatus: 'TENANT_EVIDENCE_UPLOADED',
      photos: ['https://storage.example.com/photo1.jpg'],
      updatedAt: new Date().toISOString(),
    }));
  });

  it('gatePasses isolation: Tenant can manage own gatePasses, others blocked', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'gatePasses/pass_1'), { tenantUid: 'tenant_a', visitorName: 'Visitor 1' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    // Tenant A should be able to read/create/delete their own
    await assertSucceeds(getDoc(doc(tenantADb, 'gatePasses/pass_1')));
    await assertSucceeds(setDoc(doc(tenantADb, 'gatePasses/pass_new'), { tenantUid: 'tenant_a', visitorName: 'Visitor New' }));
    
    // Tenant B should fail to read or delete Tenant A's gatePasses
    await assertFails(getDoc(doc(tenantBDb, 'gatePasses/pass_1')));
  });

  it('amenityBookings isolation: Tenant can manage own bookings, others blocked', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'amenityBookings/booking_1'), { tenantUid: 'tenant_a', amenityName: 'Pool' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    await assertSucceeds(getDoc(doc(tenantADb, 'amenityBookings/booking_1')));
    await assertFails(getDoc(doc(tenantBDb, 'amenityBookings/booking_1')));
  });

  it('tenant property access: Tenant can read assigned property doc', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    
    // Setup property
    await setDoc(doc(adminDb, 'properties/prop_a'), { ownerId: 'owner_a' });
    // Setup tenant user doc with propertyId
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a', ownerId: 'owner_a' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    // Tenant A (assigned to prop_a) should succeed
    await assertSucceeds(getDoc(doc(tenantADb, 'properties/prop_a')));
    // Tenant B (not assigned to prop_a) should fail
    await assertFails(getDoc(doc(tenantBDb, 'properties/prop_a')));
  });

  it('owner tenant profile access: Owner can read assigned tenants', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    // Setup property owned by owner_a
    await setDoc(doc(adminDb, 'properties/prop_a'), { ownerId: 'owner_a' });
    // Setup tenant user doc assigned to prop_a
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a', ownerId: 'owner_a' });

    const ownerADb = testEnv.authenticatedContext('owner_a').firestore();
    const ownerBDb = testEnv.authenticatedContext('owner_b').firestore();

    // Owner A (owns prop_a) should be able to read Tenant A's user doc
    await assertSucceeds(getDoc(doc(ownerADb, 'users/tenant_a')));
    // Owner B (does not own prop_a) should fail
    await assertFails(getDoc(doc(ownerBDb, 'users/tenant_a')));
  });
});

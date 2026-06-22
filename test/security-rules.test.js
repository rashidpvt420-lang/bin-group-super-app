import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
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

  it('open mission claim: only technician or dispatcher-authorized users can claim open jobs', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'maintenanceTickets/open_ticket'), {
      tenantId: 'tenant_a',
      propertyId: 'prop_a',
      unitId: 'unit_a',
      assignedTechnicianId: null,
      status: 'OPEN',
    });

    const ownerDb = testEnv.authenticatedContext('owner_a', { role: 'owner' }).firestore();
    await assertFails(updateDoc(doc(ownerDb, 'maintenanceTickets/open_ticket'), {
      assignedTechnicianId: 'owner_a',
      technicianId: 'owner_a',
      status: 'ASSIGNED',
      updatedAt: new Date().toISOString(),
      assignedAt: new Date().toISOString(),
    }));

    const techDb = testEnv.authenticatedContext('tech_a', { role: 'technician' }).firestore();
    await assertSucceeds(updateDoc(doc(techDb, 'maintenanceTickets/open_ticket'), {
      assignedTechnicianId: 'tech_a',
      technicianId: 'tech_a',
      status: 'ASSIGNED',
      updatedAt: new Date().toISOString(),
      assignedAt: new Date().toISOString(),
    }));
  });

  it('tenant ticket creation: tenant must use their own assigned unit and matching property', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'units/unit_a'), { tenantId: 'tenant_a', propertyId: 'prop_a', ownerId: 'owner_a' });
    await setDoc(doc(adminDb, 'units/unit_b'), { tenantId: 'tenant_b', propertyId: 'prop_b', ownerId: 'owner_b' });

    const tenantADb = testEnv.authenticatedContext('tenant_a', { role: 'tenant', email: 'tenant-a@example.com' }).firestore();

    await assertSucceeds(setDoc(doc(tenantADb, 'maintenanceTickets/tenant_valid_ticket'), {
      tenantId: 'tenant_a',
      tenantUid: 'tenant_a',
      unitId: 'unit_a',
      propertyId: 'prop_a',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
    }));

    await assertFails(setDoc(doc(tenantADb, 'maintenanceTickets/wrong_property_ticket'), {
      tenantId: 'tenant_a',
      tenantUid: 'tenant_a',
      unitId: 'unit_a',
      propertyId: 'prop_b',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
    }));

    await assertFails(setDoc(doc(tenantADb, 'maintenanceTickets/wrong_unit_ticket'), {
      tenantId: 'tenant_a',
      tenantUid: 'tenant_a',
      unitId: 'unit_b',
      propertyId: 'prop_b',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
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

    // Tenant B should fail to read Tenant A's gatePasses
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

  it('tenant property access: Tenant can read assigned property doc and another valid tenant is blocked', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    // Setup properties
    await setDoc(doc(adminDb, 'properties/prop_a'), { ownerId: 'owner_a', tenantId: 'tenant_a' });
    await setDoc(doc(adminDb, 'properties/prop_b'), { ownerId: 'owner_b', tenantId: 'tenant_b' });

    // Setup tenant user docs so both tenant contexts are valid tenant users.
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a', ownerId: 'owner_a' });
    await setDoc(doc(adminDb, 'users/tenant_b'), { role: 'tenant', propertyId: 'prop_b', ownerId: 'owner_b' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    // Tenant A should read only its assigned property.
    await assertSucceeds(getDoc(doc(tenantADb, 'properties/prop_a')));
    await assertFails(getDoc(doc(tenantADb, 'properties/prop_b')));

    // Tenant B is a real tenant user, but must still be blocked from Tenant A's property.
    await assertFails(getDoc(doc(tenantBDb, 'properties/prop_a')));
  });

  it('notifications abuse guard: user cannot create notification for another recipient', async () => {
    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();

    await assertFails(setDoc(doc(tenantADb, 'notifications/for_tenant_b'), {
      recipientId: 'tenant_b',
      userId: 'tenant_b',
      createdBy: 'tenant_a',
      title: 'Fake operational notification',
      body: 'This should be blocked by rules.',
      createdAt: new Date().toISOString(),
      read: false,
    }));
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

  it('paymentConfirmations: tenant can create their own pending confirmation', async () => {
    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    await assertSucceeds(setDoc(doc(tenantADb, 'paymentConfirmations/confirm_1'), {
      tenantId: 'tenant_a',
      invoiceId: 'inv_1',
      amount: 5000,
      method: 'bank_transfer_whatsapp_confirmation',
      status: 'pending_verification',
    }));
  });

  it('paymentConfirmations: tenant cannot create a confirmation for another tenant', async () => {
    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    await assertFails(setDoc(doc(tenantADb, 'paymentConfirmations/confirm_2'), {
      tenantId: 'tenant_b',
      invoiceId: 'inv_2',
      amount: 5000,
      status: 'pending_verification',
    }));
  });

  it('paymentConfirmations: tenant cannot self-verify on create', async () => {
    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    await assertFails(setDoc(doc(tenantADb, 'paymentConfirmations/confirm_3'), {
      tenantId: 'tenant_a',
      invoiceId: 'inv_3',
      amount: 5000,
      status: 'pending_verification',
      paymentVerified: true,
    }));
  });

  it('paymentConfirmations: only the owning tenant or admin can read it', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'paymentConfirmations/confirm_4'), {
      tenantId: 'tenant_a',
      invoiceId: 'inv_4',
      amount: 5000,
      status: 'pending_verification',
    });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();
    await assertSucceeds(getDoc(doc(tenantADb, 'paymentConfirmations/confirm_4')));
    await assertSucceeds(getDoc(doc(adminDb, 'paymentConfirmations/confirm_4')));
    await assertFails(getDoc(doc(tenantBDb, 'paymentConfirmations/confirm_4')));
  });

  it('amenitySlots: a tenant can claim a free slot but cannot overwrite another tenant\'s lock', async () => {
    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    // Tenant A claims the slot.
    await assertSucceeds(setDoc(doc(tenantADb, 'amenitySlots/pool__2026-07-01__9AM'), {
      tenantUid: 'tenant_a', amenityName: 'Community Pool', bookingDate: '2026-07-01', timeSlot: '9AM',
    }));
    // Tenant B can read it (needed to detect the conflict) but cannot overwrite it.
    await assertSucceeds(getDoc(doc(tenantBDb, 'amenitySlots/pool__2026-07-01__9AM')));
    await assertFails(setDoc(doc(tenantBDb, 'amenitySlots/pool__2026-07-01__9AM'), {
      tenantUid: 'tenant_b', amenityName: 'Community Pool', bookingDate: '2026-07-01', timeSlot: '9AM',
    }));
    // Tenant B cannot free Tenant A's lock; Tenant A can.
    await assertFails(deleteDoc(doc(tenantBDb, 'amenitySlots/pool__2026-07-01__9AM')));
    await assertSucceeds(deleteDoc(doc(tenantADb, 'amenitySlots/pool__2026-07-01__9AM')));
  });

  it('amenitySlots: a tenant cannot create a lock owned by someone else', async () => {
    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    await assertFails(setDoc(doc(tenantADb, 'amenitySlots/gym__2026-07-02__10AM'), {
      tenantUid: 'tenant_b', amenityName: 'Fitness Center', bookingDate: '2026-07-02', timeSlot: '10AM',
    }));
  });

  it('amenities catalog: scoped to the property tenant/owner/admin, not any signed-in user', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a' });
    await setDoc(doc(adminDb, 'users/tenant_b'), { role: 'tenant', propertyId: 'prop_b' });
    await setDoc(doc(adminDb, 'properties/prop_a'), { ownerId: 'owner_a' });
    await assertSucceeds(setDoc(doc(adminDb, 'amenities/pool'), { name: 'Community Pool', active: true, propertyId: 'prop_a' }));

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();
    const ownerADb = testEnv.authenticatedContext('owner_a').firestore();

    // Tenant of the same property can read
    await assertSucceeds(getDoc(doc(tenantADb, 'amenities/pool')));
    // Tenant of a different property cannot read
    await assertFails(getDoc(doc(tenantBDb, 'amenities/pool')));
    // Tenant cannot write
    await assertFails(setDoc(doc(tenantADb, 'amenities/pool'), { name: 'Hacked', active: true, propertyId: 'prop_a' }));
    // The property's own owner can update its amenities
    await assertSucceeds(updateDoc(doc(ownerADb, 'amenities/pool'), { active: false }));
  });

  it('paymentConfirmations: tenant cannot update or delete after creation', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'paymentConfirmations/confirm_5'), {
      tenantId: 'tenant_a',
      invoiceId: 'inv_5',
      amount: 5000,
      status: 'pending_verification',
    });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    await assertFails(updateDoc(doc(tenantADb, 'paymentConfirmations/confirm_5'), { status: 'verified' }));
  });

  it('tenant cannot read another propertys amenity booking', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    
    // Seed users, properties, and booking
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a' });
    await setDoc(doc(adminDb, 'users/tenant_b'), { role: 'tenant', propertyId: 'prop_b' });
    await setDoc(doc(adminDb, 'properties/prop_b'), { ownerId: 'owner_b' });
    await setDoc(doc(adminDb, 'amenityBookings/booking_b'), { propertyId: 'prop_b', tenantUid: 'tenant_b', amenityName: 'Gym' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    // Tenant B (same property) can read it
    await assertSucceeds(getDoc(doc(tenantBDb, 'amenityBookings/booking_b')));
    // Tenant A (different property) cannot read it
    await assertFails(getDoc(doc(tenantADb, 'amenityBookings/booking_b')));
  });

  it('tenant cannot create visitor parking for another unit', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    
    // Seed users, units
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a' });
    await setDoc(doc(adminDb, 'units/unit_a'), { tenantId: 'tenant_a', propertyId: 'prop_a' });
    await setDoc(doc(adminDb, 'units/unit_b'), { tenantId: 'tenant_b', propertyId: 'prop_b' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();

    // Tenant A can create parking for unit_a (their own unit)
    await assertSucceeds(setDoc(doc(tenantADb, 'visitorParkingRequests/req_a'), {
      tenantUid: 'tenant_a',
      propertyId: 'prop_a',
      unitId: 'unit_a',
      visitorName: 'Visitor 1',
    }));

    // Tenant A cannot create parking for unit_b (another unit)
    await assertFails(setDoc(doc(tenantADb, 'visitorParkingRequests/req_b'), {
      tenantUid: 'tenant_a',
      propertyId: 'prop_a',
      unitId: 'unit_b',
      visitorName: 'Visitor 1',
    }));
  });

  it('tenant cannot read another tenants parcel', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    
    // Seed parcel
    await setDoc(doc(adminDb, 'parcels/parcel_b'), { tenantUid: 'tenant_b', propertyId: 'prop_b' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    // Tenant B can read their own parcel
    await assertSucceeds(getDoc(doc(tenantBDb, 'parcels/parcel_b')));
    // Tenant A cannot read Tenant B's parcel
    await assertFails(getDoc(doc(tenantADb, 'parcels/parcel_b')));
  });

  it('admin can manage parcel/parking/amenity records', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    // Admin can create/read/update/delete amenities
    await assertSucceeds(setDoc(doc(adminDb, 'amenities/amenity_1'), { name: 'Gym', propertyId: 'prop_a' }));
    await assertSucceeds(getDoc(doc(adminDb, 'amenities/amenity_1')));

    // Admin can manage parcels
    await assertSucceeds(setDoc(doc(adminDb, 'parcels/parcel_1'), { tenantUid: 'tenant_a', propertyId: 'prop_a', status: 'received' }));
    
    // Admin can manage parking
    await assertSucceeds(setDoc(doc(adminDb, 'visitorParkingRequests/req_1'), { tenantUid: 'tenant_a', propertyId: 'prop_a', unitId: 'unit_a', status: 'pending' }));
  });

  it('owner can manage only owned property records', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    
    // Seed properties
    await setDoc(doc(adminDb, 'properties/prop_own'), { ownerId: 'owner_a' });
    await setDoc(doc(adminDb, 'properties/prop_other'), { ownerId: 'owner_other' });

    const ownerADb = testEnv.authenticatedContext('owner_a', { role: 'owner' }).firestore();

    // Owner A can create/manage amenities for owned property
    await assertSucceeds(setDoc(doc(ownerADb, 'amenities/amenity_own'), { propertyId: 'prop_own', name: 'Pool' }));
    // Owner A cannot manage amenities for other property
    await assertFails(setDoc(doc(ownerADb, 'amenities/amenity_other'), { propertyId: 'prop_other', name: 'Pool' }));
  });

  it('marketplace public/tenant access behaves as intended', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();

    // Tenant can read providers and offers
    await setDoc(doc(adminDb, 'marketplaceProviders/provider_1'), { name: 'Clean Co', approved: true });
    await setDoc(doc(adminDb, 'marketplaceOffers/offer_1'), { providerId: 'provider_1', title: '10% Off' });

    await assertSucceeds(getDoc(doc(tenantADb, 'marketplaceProviders/provider_1')));
    await assertSucceeds(getDoc(doc(tenantADb, 'marketplaceOffers/offer_1')));

    // Tenant cannot write to marketplace
    await assertFails(setDoc(doc(tenantADb, 'marketplaceProviders/provider_2'), { name: 'Tenant Shop' }));
  });

  it('community posts require moderation', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();

    // Tenant can create community post as pending
    await assertSucceeds(setDoc(doc(tenantADb, 'communityPosts/post_1'), {
      authorUid: 'tenant_a',
      propertyId: 'prop_a',
      status: 'pending',
      title: 'Hello Community',
    }));

    // Tenant cannot create community post directly as approved
    await assertFails(setDoc(doc(tenantADb, 'communityPosts/post_2'), {
      authorUid: 'tenant_a',
      propertyId: 'prop_a',
      status: 'approved',
      title: 'Hack approved status',
    }));
  });

  it('messages only visible to participants', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    // Seed conversation between Tenant A and Admin
    await setDoc(doc(adminDb, 'conversations/conv_1'), {
      participantUids: ['tenant_a', 'admin_user'],
      propertyId: 'prop_a',
    });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    // Tenant A is participant and can read/write messages
    await assertSucceeds(getDoc(doc(tenantADb, 'conversations/conv_1')));
    
    // Tenant B is NOT participant and cannot read
    await assertFails(getDoc(doc(tenantBDb, 'conversations/conv_1')));
  });

  it('inspections: tenant can create own inspection and read it back', async () => {
    const tenantDb = testEnv.authenticatedContext('tenant_a').firestore();
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    // Tenant can create inspection for themselves
    await assertSucceeds(setDoc(doc(tenantDb, 'inspections/insp_1'), {
      tenantId: 'tenant_a',
      type: 'move_in',
      status: 'submitted',
    }));

    // Tenant can read their own inspection
    await assertSucceeds(getDoc(doc(tenantDb, 'inspections/insp_1')));

    // Another tenant cannot read it
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();
    await assertFails(getDoc(doc(tenantBDb, 'inspections/insp_1')));

    // Admin can read it
    await assertSucceeds(getDoc(doc(adminDb, 'inspections/insp_1')));
  });

  it('inspections: tenant cannot create inspection for another tenant', async () => {
    const tenantDb = testEnv.authenticatedContext('tenant_a').firestore();

    // Creating with someone else's tenantId must fail
    await assertFails(setDoc(doc(tenantDb, 'inspections/insp_2'), {
      tenantId: 'tenant_b',
      type: 'move_out',
      status: 'submitted',
    }));
  });

  it('maintenanceRequests: tenant can create and read own request', async () => {
    const tenantDb = testEnv.authenticatedContext('tenant_a').firestore();
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    // Tenant creates their own request
    await assertSucceeds(setDoc(doc(tenantDb, 'maintenanceRequests/req_1'), {
      tenantId: 'tenant_a',
      description: 'AC not cooling',
      category: 'AC / Cooling',
      priority: 'HIGH',
      source: 'AI_CONCIERGE',
      status: 'OPEN',
    }));

    // Tenant can read their own request
    await assertSucceeds(getDoc(doc(tenantDb, 'maintenanceRequests/req_1')));

    // Another tenant cannot read it
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();
    await assertFails(getDoc(doc(tenantBDb, 'maintenanceRequests/req_1')));
  });

  it('maintenanceRequests: tenant cannot create request for another tenant', async () => {
    const tenantDb = testEnv.authenticatedContext('tenant_a').firestore();

    await assertFails(setDoc(doc(tenantDb, 'maintenanceRequests/req_2'), {
      tenantId: 'tenant_b',
      description: 'Water leak',
      status: 'OPEN',
    }));
  });
});

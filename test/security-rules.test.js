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
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'properties/prop_b'), { ownerId: 'owner_b' });
    await setDoc(doc(adminDb, 'propertyMembers/prop_b/members/owner_b'), { role: 'owner', active: true });

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

  it('owner profile activation fields remain server-authoritative', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'owners/owner_a'), {
      ownerId: 'owner_a',
      status: 'pending_admin_approval',
      adminApproved: false,
      paymentVerified: false,
      dashboardUnlocked: false,
      dashboardLocked: true,
      activeContractId: null,
    });
    const ownerDb = testEnv.authenticatedContext('owner_a', { role: 'owner' }).firestore();
    await assertFails(updateDoc(doc(ownerDb, 'owners/owner_a'), {
      adminApproved: true,
      dashboardLocked: false,
      activeContractId: 'forged_contract',
    }));
  });

  it('admin override: Admin can read all', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await assertSucceeds(getDoc(doc(adminDb, 'properties/prop_b')));
  });

  it('suspended Auth claims deny access even to an owned record', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'properties/suspended_owner_property'), { ownerId: 'owner_suspended' });

    const suspendedOwnerDb = testEnv.authenticatedContext('owner_suspended', {
      role: 'owner',
      suspended: true,
    }).firestore();
    await assertFails(getDoc(doc(suspendedOwnerDb, 'properties/suspended_owner_property')));
  });

  it('tenant ticket access: Tenant can read their own tickets', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'maintenanceTickets/ticket_1'), { tenantId: 'tenant_a' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    await assertSucceeds(getDoc(doc(tenantADb, 'maintenanceTickets/ticket_1')));
  });

  it('technician assigned-ticket access: approved technician can read assigned tickets', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'technicians/tech_a'), { status: 'active', approved: true });
    await setDoc(doc(adminDb, 'maintenanceTickets/ticket_2'), { assignedTechnicianId: 'tech_a' });

    const techADb = testEnv.authenticatedContext('tech_a', { role: 'technician' }).firestore();
    await assertSucceeds(getDoc(doc(techADb, 'maintenanceTickets/ticket_2')));
  });

  it('ticket update narrowing: approved technician cannot reassign or escalate ticket', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'technicians/tech_a'), { status: 'active', approved: true });
    await setDoc(doc(adminDb, 'maintenanceTickets/ticket_3'), {
      assignedTechnicianId: 'tech_a',
      status: 'ASSIGNED',
      priority: 'NORMAL',
      paymentVerified: false,
    });

    const techADb = testEnv.authenticatedContext('tech_a', { role: 'technician' }).firestore();
    await assertFails(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      assignedTechnicianId: 'tech_evil',
      updatedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      priority: 'URGENT',
      updatedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      status: 'IN_PROGRESS',
      updatedAt: new Date().toISOString(),
    }));
    await assertSucceeds(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      technicianNotes: 'Verified evidence note from assigned technician.',
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
    await assertFails(updateDoc(doc(tenantADb, 'maintenanceTickets/ticket_4'), {
      status: 'CLOSED',
      updatedAt: new Date().toISOString(),
    }));
    await assertSucceeds(updateDoc(doc(tenantADb, 'maintenanceTickets/ticket_4'), {
      evidenceStatus: 'TENANT_EVIDENCE_UPLOADED',
      photos: ['https://storage.example.com/photo1.jpg'],
      updatedAt: new Date().toISOString(),
    }));
  });

  it('open mission assignment: direct client claims fail and dispatcher authority assigns', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    const openTicket = {
      tenantId: 'tenant_a',
      propertyId: 'prop_a',
      unitId: 'unit_a',
      assignedTechnicianId: null,
      status: 'OPEN',
    };
    await setDoc(doc(adminDb, 'tickets/open_ticket'), openTicket);
    await setDoc(doc(adminDb, 'maintenanceTickets/open_maintenance_ticket'), openTicket);

    const claim = {
      assignedTechnicianId: 'tech_a',
      technicianId: 'tech_a',
      status: 'ASSIGNED',
      updatedAt: new Date().toISOString(),
      assignedAt: new Date().toISOString(),
    };

    const ownerDb = testEnv.authenticatedContext('owner_a', { role: 'owner' }).firestore();
    await assertFails(updateDoc(doc(ownerDb, 'tickets/open_ticket'), claim));

    const techDb = testEnv.authenticatedContext('tech_a', { role: 'technician' }).firestore();
    await assertFails(updateDoc(doc(techDb, 'tickets/open_ticket'), claim));
    await assertFails(updateDoc(doc(techDb, 'maintenanceTickets/open_maintenance_ticket'), claim));

    // Approved technician profile still cannot self-claim via client write (server transaction required).
    await setDoc(doc(adminDb, 'technicians/tech_approved'), {
      status: 'active',
      approvalStatus: 'approved',
      suspended: false,
    });
    await setDoc(doc(adminDb, 'users/tech_approved'), {
      role: 'technician',
      status: 'active',
      approvalStatus: 'approved',
      suspended: false,
    });
    await setDoc(doc(adminDb, 'tickets/open_ticket_approved_tech'), openTicket);
    await setDoc(doc(adminDb, 'maintenanceTickets/open_maintenance_ticket_approved_tech'), openTicket);
    const approvedTechDb = testEnv.authenticatedContext('tech_approved', { role: 'technician' }).firestore();
    await assertFails(getDoc(doc(approvedTechDb, 'tickets/open_ticket_approved_tech')));
    await assertFails(getDoc(doc(approvedTechDb, 'maintenanceTickets/open_maintenance_ticket_approved_tech')));
    await assertFails(updateDoc(doc(approvedTechDb, 'tickets/open_ticket_approved_tech'), {
      assignedTechnicianId: 'tech_approved',
      technicianId: 'tech_approved',
      status: 'ASSIGNED',
      updatedAt: new Date().toISOString(),
      assignedAt: new Date().toISOString(),
    }));

    const dispatcherDb = testEnv.authenticatedContext('dispatcher_a', { role: 'dispatcher' }).firestore();
    await assertSucceeds(updateDoc(doc(dispatcherDb, 'tickets/open_ticket'), claim));
    await assertSucceeds(updateDoc(doc(dispatcherDb, 'maintenanceTickets/open_maintenance_ticket'), claim));
    await assertFails(updateDoc(doc(dispatcherDb, 'tickets/open_ticket'), {
      paymentVerified: true,
      status: 'CLOSED',
      updatedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(dispatcherDb, 'maintenanceTickets/open_maintenance_ticket'), {
      paymentVerified: true,
      status: 'CLOSED',
      updatedAt: new Date().toISOString(),
    }));
  });

  it('physical access passes: tenants cannot mint or approve pass records directly', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a', unitId: 'unit_a' });
    await setDoc(doc(adminDb, 'units/unit_a'), { tenantId: 'tenant_a', propertyId: 'prop_a', ownerId: 'owner_a' });

    const tenantDb = testEnv.authenticatedContext('tenant_a', { role: 'tenant' }).firestore();
    await assertFails(setDoc(doc(tenantDb, 'gatePasses/forged'), {
      passId: 'forged',
      tenantUid: 'tenant_a',
      propertyId: 'prop_a',
      unitId: 'unit_a',
      status: 'active',
      qrToken: 'forged',
    }));
    await assertFails(setDoc(doc(tenantDb, 'visitorParkingRequests/forged'), {
      passId: 'forged',
      tenantUid: 'tenant_a',
      propertyId: 'prop_a',
      unitId: 'unit_a',
      status: 'approved',
      qrToken: 'forged',
    }));
    await setDoc(doc(adminDb, 'visitorParkingRequests/server_created'), {
      passId: 'server_created',
      tenantUid: 'tenant_a',
      propertyId: 'prop_a',
      unitId: 'unit_a',
      status: 'pending',
      qrToken: 'signed-on-server',
    });
    await assertFails(updateDoc(doc(tenantDb, 'visitorParkingRequests/server_created'), {
      status: 'approved',
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
      evidenceStatus: 'PENDING_TENANT_UPLOAD',
      assignedTechnicianId: null,
      technicianId: null,
    }));

    await assertFails(setDoc(doc(tenantADb, 'maintenanceTickets/wrong_property_ticket'), {
      tenantId: 'tenant_a',
      tenantUid: 'tenant_a',
      unitId: 'unit_a',
      propertyId: 'prop_b',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
      evidenceStatus: 'PENDING_TENANT_UPLOAD',
      assignedTechnicianId: null,
      technicianId: null,
    }));

    await assertFails(setDoc(doc(tenantADb, 'maintenanceTickets/wrong_unit_ticket'), {
      tenantId: 'tenant_a',
      tenantUid: 'tenant_a',
      unitId: 'unit_b',
      propertyId: 'prop_b',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
      evidenceStatus: 'PENDING_TENANT_UPLOAD',
      assignedTechnicianId: null,
      technicianId: null,
    }));
  });

  it('gatePasses isolation: Tenant can read own server pass but cannot mint one', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'gatePasses/pass_1'), { tenantUid: 'tenant_a', visitorName: 'Visitor 1' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    await assertSucceeds(getDoc(doc(tenantADb, 'gatePasses/pass_1')));
    await assertFails(setDoc(doc(tenantADb, 'gatePasses/pass_new'), { tenantUid: 'tenant_a', visitorName: 'Visitor New' }));
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
    await setDoc(doc(adminDb, 'properties/prop_a'), { ownerId: 'owner_a', tenantId: 'tenant_a' });
    await setDoc(doc(adminDb, 'properties/prop_b'), { ownerId: 'owner_b', tenantId: 'tenant_b' });
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a', ownerId: 'owner_a' });
    await setDoc(doc(adminDb, 'users/tenant_b'), { role: 'tenant', propertyId: 'prop_b', ownerId: 'owner_b' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    await assertSucceeds(getDoc(doc(tenantADb, 'properties/prop_a')));
    await assertFails(getDoc(doc(tenantADb, 'properties/prop_b')));
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
    await setDoc(doc(adminDb, 'properties/prop_a'), { ownerId: 'owner_a' });
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a', ownerId: 'owner_a' });

    const ownerADb = testEnv.authenticatedContext('owner_a').firestore();
    const ownerBDb = testEnv.authenticatedContext('owner_b').firestore();

    await assertSucceeds(getDoc(doc(ownerADb, 'users/tenant_a')));
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

  it('broker KYC: broker cannot self-approve verified KYC fields', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/broker_a'), {
      role: 'broker',
      status: 'PENDING',
      reraVerified: false,
      reraStatus: 'PENDING',
      brokerKycStatus: 'PENDING_REVIEW',
    });

    const brokerDb = testEnv.authenticatedContext('broker_a', { role: 'broker', email: 'broker-a@example.com' }).firestore();
    await assertFails(updateDoc(doc(brokerDb, 'users/broker_a'), {
      status: 'APPROVED',
      reraVerified: true,
      reraStatus: 'VERIFIED',
      brokerKycStatus: 'VERIFIED',
      updatedAt: new Date().toISOString(),
    }));
  });

  it('broker payout requests: broker cannot bypass callable review by writing request records directly', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'broker_payout_requests/request_seed'), {
        brokerId: 'broker_a',
        brokerUid: 'broker_a',
        amount: 2500,
        status: 'PENDING_ADMIN_REVIEW',
        approvalStatus: 'PENDING',
        paymentStatus: 'REQUESTED',
        commissionIds: ['commission_1'],
      });
    });

    const brokerDb = testEnv.authenticatedContext('broker_a', { role: 'broker', email: 'broker-a@example.com' }).firestore();
    await assertSucceeds(getDoc(doc(brokerDb, 'broker_payout_requests/request_seed')));
    await assertFails(setDoc(doc(brokerDb, 'broker_payout_requests/request_new'), {
      brokerId: 'broker_a',
      brokerUid: 'broker_a',
      brokerEmail: 'broker-a@example.com',
      amount: 2500,
      status: 'PENDING_ADMIN_REVIEW',
      approvalStatus: 'PENDING',
      paymentStatus: 'REQUESTED',
      commissionIds: ['commission_1'],
    }));

    await assertFails(setDoc(doc(brokerDb, 'broker_payout_requests/request_paid'), {
      brokerId: 'broker_a',
      brokerUid: 'broker_a',
      amount: 2500,
      status: 'PAID',
      approvalStatus: 'APPROVED',
      paymentStatus: 'PAID',
      paidBy: 'broker_a',
      commissionIds: ['commission_1'],
    }));

    await assertFails(updateDoc(doc(brokerDb, 'broker_payout_requests/request_seed'), {
      status: 'PAID',
      paymentStatus: 'PAID',
      paidBy: 'broker_a',
    }));
  });

  it('tenant unit link fallback: tenant can request verification but cannot self-link or request for another tenant', async () => {
    const tenantDb = testEnv.authenticatedContext('tenant_a', { role: 'tenant', email: 'tenant-a@example.com' }).firestore();

    await assertSucceeds(setDoc(doc(tenantDb, 'tenant_unit_link_requests/request_valid'), {
      tenantUid: 'tenant_a',
      tenantId: 'tenant_a',
      tenantEmail: 'tenant-a@example.com',
      propertyName: 'Pilot Tower',
      unitNumber: '1204',
      status: 'PENDING_ADMIN_REVIEW',
      verificationState: 'ADMIN_OR_OWNER_VERIFICATION_REQUIRED',
    }));

    await assertFails(setDoc(doc(tenantDb, 'tenant_unit_link_requests/request_self_approved'), {
      tenantUid: 'tenant_a',
      tenantId: 'tenant_a',
      propertyName: 'Pilot Tower',
      unitNumber: '1204',
      status: 'APPROVED',
      verificationState: 'VERIFIED',
      linkedUnitId: 'unit_a',
    }));

    await assertFails(setDoc(doc(tenantDb, 'tenant_unit_link_requests/request_other_tenant'), {
      tenantUid: 'tenant_b',
      tenantId: 'tenant_b',
      propertyName: 'Pilot Tower',
      unitNumber: '1204',
      status: 'PENDING_ADMIN_REVIEW',
      verificationState: 'ADMIN_OR_OWNER_VERIFICATION_REQUIRED',
    }));
  });

  it('units owner isolation: owner cannot read or create units for another owner', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'units/owner_b_unit'), {
      ownerId: 'owner_b',
      propertyId: 'prop_b',
      unitNumber: 'B-101',
    });

    const ownerADb = testEnv.authenticatedContext('owner_a', { role: 'owner', email: 'owner-a@example.com' }).firestore();
    await assertFails(getDoc(doc(ownerADb, 'units/owner_b_unit')));
    await assertFails(setDoc(doc(ownerADb, 'units/owner_a_created_directly'), {
      ownerId: 'owner_a',
      propertyId: 'prop_a',
      unitNumber: 'A-101',
      status: 'VACANT',
    }));
  });

  it('signed-in smoke checklist: admin can record proof and non-admin cannot', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await assertSucceeds(setDoc(doc(adminDb, 'signed_in_smoke_checks/admin_owner_smoke'), {
      role: 'owner',
      status: 'passed',
      testerEmail: 'admin@example.com',
      accountEmail: 'owner@example.com',
      route: '/owner',
      proofRef: 'screenshot-owner-dashboard.png',
    }));

    const tenantDb = testEnv.authenticatedContext('tenant_a', { role: 'tenant' }).firestore();
    await assertFails(setDoc(doc(tenantDb, 'signed_in_smoke_checks/tenant_fake_smoke'), {
      role: 'admin',
      status: 'passed',
      proofRef: 'fake',
    }));
  });

  it('amenitySlots: same-property tenants can detect a lock but cannot replace its owner', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a' });
    await setDoc(doc(adminDb, 'users/tenant_b'), { role: 'tenant', propertyId: 'prop_a' });
    await setDoc(doc(adminDb, 'users/tenant_c'), { role: 'tenant', propertyId: 'prop_b' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();
    const tenantCDb = testEnv.authenticatedContext('tenant_c').firestore();

    await assertSucceeds(setDoc(doc(tenantADb, 'amenitySlots/pool__2026-07-01__9AM'), {
      tenantUid: 'tenant_a',
      propertyId: 'prop_a',
      amenityName: 'Community Pool',
      bookingDate: '2026-07-01',
      timeSlot: '9AM',
    }));
    await assertSucceeds(getDoc(doc(tenantBDb, 'amenitySlots/pool__2026-07-01__9AM')));
    await assertFails(getDoc(doc(tenantCDb, 'amenitySlots/pool__2026-07-01__9AM')));
    await assertFails(setDoc(doc(tenantBDb, 'amenitySlots/pool__2026-07-01__9AM'), {
      tenantUid: 'tenant_b',
      propertyId: 'prop_a',
      amenityName: 'Community Pool',
      bookingDate: '2026-07-01',
      timeSlot: '9AM',
    }));
    await assertFails(deleteDoc(doc(tenantBDb, 'amenitySlots/pool__2026-07-01__9AM')));
    await assertSucceeds(deleteDoc(doc(tenantADb, 'amenitySlots/pool__2026-07-01__9AM')));
  });

  it('amenitySlots: tenant cannot create an unscoped lock', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    await assertFails(setDoc(doc(tenantADb, 'amenitySlots/unscoped'), {
      tenantUid: 'tenant_a',
      amenityName: 'Community Pool',
      bookingDate: '2026-07-01',
      timeSlot: '10AM',
    }));
  });

  it('amenitySlots: a tenant cannot create a lock owned by someone else', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    await assertFails(setDoc(doc(tenantADb, 'amenitySlots/gym__2026-07-02__10AM'), {
      tenantUid: 'tenant_b',
      propertyId: 'prop_a',
      amenityName: 'Fitness Center',
      bookingDate: '2026-07-02',
      timeSlot: '10AM',
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

    await assertSucceeds(getDoc(doc(tenantADb, 'amenities/pool')));
    await assertFails(getDoc(doc(tenantBDb, 'amenities/pool')));
    await assertFails(setDoc(doc(tenantADb, 'amenities/pool'), { name: 'Hacked', active: true, propertyId: 'prop_a' }));
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
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a' });
    await setDoc(doc(adminDb, 'users/tenant_b'), { role: 'tenant', propertyId: 'prop_b' });
    await setDoc(doc(adminDb, 'properties/prop_b'), { ownerId: 'owner_b' });
    await setDoc(doc(adminDb, 'amenityBookings/booking_b'), { propertyId: 'prop_b', tenantUid: 'tenant_b', amenityName: 'Gym' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    await assertSucceeds(getDoc(doc(tenantBDb, 'amenityBookings/booking_b')));
    await assertFails(getDoc(doc(tenantADb, 'amenityBookings/booking_b')));
  });

  it('tenant cannot create visitor parking records directly', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a' });
    await setDoc(doc(adminDb, 'units/unit_a'), { tenantId: 'tenant_a', propertyId: 'prop_a' });
    await setDoc(doc(adminDb, 'units/unit_b'), { tenantId: 'tenant_b', propertyId: 'prop_b' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();

    await assertFails(setDoc(doc(tenantADb, 'visitorParkingRequests/req_a'), {
      tenantUid: 'tenant_a',
      propertyId: 'prop_a',
      unitId: 'unit_a',
      visitorName: 'Visitor 1',
    }));

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
    await setDoc(doc(adminDb, 'parcels/parcel_b'), { tenantUid: 'tenant_b', propertyId: 'prop_b' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    await assertSucceeds(getDoc(doc(tenantBDb, 'parcels/parcel_b')));
    await assertFails(getDoc(doc(tenantADb, 'parcels/parcel_b')));
  });

  it('admin can manage parcel/parking/amenity records', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    await assertSucceeds(setDoc(doc(adminDb, 'amenities/amenity_1'), { name: 'Gym', propertyId: 'prop_a' }));
    await assertSucceeds(getDoc(doc(adminDb, 'amenities/amenity_1')));
    await assertSucceeds(setDoc(doc(adminDb, 'parcels/parcel_1'), { tenantUid: 'tenant_a', propertyId: 'prop_a', status: 'received' }));
    await assertSucceeds(setDoc(doc(adminDb, 'visitorParkingRequests/req_1'), { tenantUid: 'tenant_a', propertyId: 'prop_a', unitId: 'unit_a', status: 'pending' }));
  });

  it('owner can manage only owned property records', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'properties/prop_own'), { ownerId: 'owner_a' });
    await setDoc(doc(adminDb, 'properties/prop_other'), { ownerId: 'owner_other' });

    const ownerADb = testEnv.authenticatedContext('owner_a', { role: 'owner' }).firestore();

    await assertSucceeds(setDoc(doc(ownerADb, 'amenities/amenity_own'), { propertyId: 'prop_own', name: 'Pool' }));
    await assertFails(setDoc(doc(ownerADb, 'amenities/amenity_other'), { propertyId: 'prop_other', name: 'Pool' }));
  });

  it('marketplace public/tenant access behaves as intended', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();

    await setDoc(doc(adminDb, 'marketplaceProviders/provider_1'), { name: 'Clean Co', approved: true });
    await setDoc(doc(adminDb, 'marketplaceOffers/offer_1'), { providerId: 'provider_1', title: '10% Off' });

    await assertSucceeds(getDoc(doc(tenantADb, 'marketplaceProviders/provider_1')));
    await assertSucceeds(getDoc(doc(tenantADb, 'marketplaceOffers/offer_1')));
    await assertFails(setDoc(doc(tenantADb, 'marketplaceProviders/provider_2'), { name: 'Tenant Shop' }));
  });

  it('community posts require moderation', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/tenant_a'), { role: 'tenant', propertyId: 'prop_a' });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();

    await assertSucceeds(setDoc(doc(tenantADb, 'communityPosts/post_1'), {
      authorUid: 'tenant_a',
      propertyId: 'prop_a',
      status: 'pending',
      title: 'Hello Community',
    }));

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
    await setDoc(doc(adminDb, 'conversations/conv_1'), {
      participantUids: ['tenant_a', 'admin_user'],
      propertyId: 'prop_a',
    });

    const tenantADb = testEnv.authenticatedContext('tenant_a').firestore();
    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();

    await assertSucceeds(getDoc(doc(tenantADb, 'conversations/conv_1')));
    await assertFails(getDoc(doc(tenantBDb, 'conversations/conv_1')));
  });

  it('inspections: tenant can create own inspection and read it back', async () => {
    const tenantDb = testEnv.authenticatedContext('tenant_a').firestore();
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    await assertSucceeds(setDoc(doc(tenantDb, 'inspections/insp_1'), {
      tenantId: 'tenant_a',
      type: 'move_in',
      status: 'submitted',
    }));

    await assertSucceeds(getDoc(doc(tenantDb, 'inspections/insp_1')));

    const tenantBDb = testEnv.authenticatedContext('tenant_b').firestore();
    await assertFails(getDoc(doc(tenantBDb, 'inspections/insp_1')));
    await assertSucceeds(getDoc(doc(adminDb, 'inspections/insp_1')));
  });

  it('inspections: tenant cannot create inspection for another tenant', async () => {
    const tenantDb = testEnv.authenticatedContext('tenant_a').firestore();

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

    await assertSucceeds(setDoc(doc(tenantDb, 'maintenanceRequests/req_1'), {
      tenantId: 'tenant_a',
      description: 'AC not cooling',
      category: 'AC / Cooling',
      priority: 'HIGH',
      source: 'AI_CONCIERGE',
      status: 'OPEN',
    }));

    await assertSucceeds(getDoc(doc(tenantDb, 'maintenanceRequests/req_1')));

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

  it('financial ledgers are server-authored even for admin browser clients', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const seedDb = context.firestore();
      await setDoc(doc(seedDb, 'payment_transactions/seed_payment'), {
        ownerId: 'owner_a',
        amount: 100,
        status: 'PENDING',
      });
    });

    const ownerDb = testEnv.authenticatedContext('owner_a', { role: 'owner' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true, role: 'admin' }).firestore();
    for (const clientDb of [ownerDb, adminDb]) {
      await assertFails(setDoc(doc(clientDb, 'payment_transactions/client_payment'), {
        ownerId: 'owner_a',
        amount: 100,
        status: 'PAID',
        paymentVerified: true,
      }));
      await assertFails(updateDoc(doc(clientDb, 'payment_transactions/seed_payment'), {
        status: 'PAID',
        paymentVerified: true,
      }));
      await assertFails(deleteDoc(doc(clientDb, 'payment_transactions/seed_payment')));
      await assertFails(setDoc(doc(clientDb, 'payments/client_payment'), { amount: 100, status: 'PAID' }));
      await assertFails(setDoc(doc(clientDb, 'transactions/client_transaction'), { amount: 100, status: 'PAID' }));
      await assertFails(setDoc(doc(clientDb, 'invoices/client_invoice'), { amount: 100, status: 'PAID' }));
    }
  });

  it('server coordination and security evidence collections reject all client writes', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_a', { role: 'owner' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true, role: 'admin' }).firestore();
    for (const clientDb of [ownerDb, adminDb]) {
      await assertFails(setDoc(doc(clientDb, 'public_rate_limits/property_test'), { count: 1 }));
      await assertFails(setDoc(doc(clientDb, 'notification_dispatch_claims/claim_test'), { createdByUid: 'owner_a' }));
      await assertFails(setDoc(doc(clientDb, 'stripe_webhook_events/evt_test'), { processed: true }));
      await assertFails(setDoc(doc(clientDb, 'contract_signature_otps/otp_test'), { status: 'VERIFIED' }));
      await assertFails(setDoc(doc(clientDb, 'ai_usage/owner_a_20260715'), { total: 1 }));
    }
  });

  it('email-based owner access requires a verified authentication email', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'propertyPassports/passport_email'), {
      ownerId: 'different_owner',
      ownerEmail: 'owner@example.com',
      status: 'ACTIVE',
    });
    await setDoc(doc(adminDb, 'users/tenant_email'), {
      role: 'tenant',
      ownerId: '',
      ownerEmail: 'owner@example.com',
    });

    const unverifiedDb = testEnv.authenticatedContext('email_owner_unverified', {
      role: 'owner',
      email: 'owner@example.com',
      email_verified: false,
    }).firestore();
    const verifiedDb = testEnv.authenticatedContext('email_owner_verified', {
      role: 'owner',
      email: 'owner@example.com',
      email_verified: true,
    }).firestore();

    await assertFails(getDoc(doc(unverifiedDb, 'propertyPassports/passport_email')));
    await assertFails(getDoc(doc(unverifiedDb, 'users/tenant_email')));
    await assertSucceeds(getDoc(doc(verifiedDb, 'propertyPassports/passport_email')));
    await assertSucceeds(getDoc(doc(verifiedDb, 'users/tenant_email')));
  });

  it('amenity slot creation fails closed when tenant property binding is absent', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/tenant_without_property'), { role: 'tenant' });
    const tenantDb = testEnv.authenticatedContext('tenant_without_property', { role: 'tenant' }).firestore();
    await assertFails(setDoc(doc(tenantDb, 'amenitySlots/unbound_slot'), {
      tenantUid: 'tenant_without_property',
      amenityName: 'Community Pool',
      bookingDate: '2026-07-02',
      timeSlot: '10AM',
    }));
  });

  it('stale-token suspended user is denied access', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    // Production suspension callables write status='suspended' before the stale token refreshes.
    await setDoc(doc(adminDb, 'users/suspended_user'), { status: 'suspended', suspended: false });
    await setDoc(doc(adminDb, 'properties/suspended_owner_prop'), { ownerId: 'suspended_user' });

    // The user's token does NOT have suspended claim (stale token representation)
    const staleTokenDb = testEnv.authenticatedContext('suspended_user', {
      role: 'owner'
    }).firestore();

    await assertFails(getDoc(doc(staleTokenDb, 'properties/suspended_owner_prop')));
    await assertFails(getDoc(doc(staleTokenDb, 'users/suspended_user')));
  });

  it('user subcollection restrictions: Operations and Finance can read top-level user directories but NOT subcollections', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/some_user'), { displayName: 'John Doe', role: 'tenant' });
    await setDoc(doc(adminDb, 'users/some_user/fcmTokens/token_123'), { token: 'token_123' });

    // Operations user
    const opsDb = testEnv.authenticatedContext('ops_user', {
      role: 'operations_manager'
    }).firestore();

    // Finance user
    const financeDb = testEnv.authenticatedContext('finance_user', {
      role: 'finance_admin'
    }).firestore();

    // Operations and Finance can read top-level user doc
    await assertSucceeds(getDoc(doc(opsDb, 'users/some_user')));
    await assertSucceeds(getDoc(doc(financeDb, 'users/some_user')));

    // Operations and Finance CANNOT read fcmTokens subcollection
    await assertFails(getDoc(doc(opsDb, 'users/some_user/fcmTokens/token_123')));
    await assertFails(getDoc(doc(financeDb, 'users/some_user/fcmTokens/token_123')));
  });

  it('user subcollection restrictions: User, Admin, and HR can read user subcollections', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/some_user'), { displayName: 'John Doe', role: 'tenant' });
    await setDoc(doc(adminDb, 'users/some_user/fcmTokens/token_123'), { token: 'token_123' });

    // HR user
    const hrDb = testEnv.authenticatedContext('hr_user', {
      role: 'hr_admin'
    }).firestore();

    // Self user
    const selfDb = testEnv.authenticatedContext('some_user', {
      role: 'tenant'
    }).firestore();

    // Admin, HR, and Self can read fcmTokens subcollection
    await assertSucceeds(getDoc(doc(adminDb, 'users/some_user/fcmTokens/token_123')));
    await assertSucceeds(getDoc(doc(hrDb, 'users/some_user/fcmTokens/token_123')));
    await assertSucceeds(getDoc(doc(selfDb, 'users/some_user/fcmTokens/token_123')));
  });
});

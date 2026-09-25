import { after, before, beforeEach, describe, it } from 'node:test';
import fs from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let testEnv;

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

const contexts = () => ({
  anon: testEnv.unauthenticatedContext().firestore(),
  ownerA: testEnv.authenticatedContext('owner_a', { role: 'owner', email: 'a@owner.test', email_verified: true }).firestore(),
  ownerB: testEnv.authenticatedContext('owner_b', { role: 'owner', email: 'b@owner.test', email_verified: true }).firestore(),
  tenantA: testEnv.authenticatedContext('tenant_a', { role: 'tenant' }).firestore(),
  tenantB: testEnv.authenticatedContext('tenant_b', { role: 'tenant' }).firestore(),
  techA: testEnv.authenticatedContext('tech_a', { role: 'technician' }).firestore(),
  brokerA: testEnv.authenticatedContext('broker_a', { role: 'broker' }).firestore(),
  brokerB: testEnv.authenticatedContext('broker_b', { role: 'broker' }).firestore(),
  admin: testEnv.authenticatedContext('admin_a', { role: 'admin', admin: true }).firestore(),
  founder: testEnv.authenticatedContext('founder_a', { role: 'ceo', ceo: true }).firestore(),
  hr: testEnv.authenticatedContext('hr_a', { role: 'hr_manager' }).firestore(),
});

async function seedMatrix() {
  const records = [
    ['users/owner_a', { role: 'owner', status: 'active', email: 'a@owner.test' }],
    ['users/owner_b', { role: 'owner', status: 'active', email: 'b@owner.test' }],
    ['users/tenant_a', { role: 'tenant', status: 'active', propertyId: 'property_a' }],
    ['users/tenant_b', { role: 'tenant', status: 'active', propertyId: 'property_b' }],
    ['users/tech_a', { role: 'technician', status: 'active' }],
    ['technicians/tech_a', { role: 'technician', status: 'active', approvalStatus: 'APPROVED' }],
    ['owners/owner_a', { ownerId: 'owner_a', ownerUid: 'owner_a', email: 'a@owner.test', status: 'active' }],
    ['properties/property_a', { ownerId: 'owner_a', ownerUid: 'owner_a', status: 'UNDER_REVIEW', name: 'Property A' }],
    ['intake_submissions/intake_a', { ownerId: 'owner_a', ownerUid: 'owner_a', status: 'UNDER_REVIEW' }],
    ['units/unit_a', { tenantId: 'tenant_a', ownerId: 'owner_a', propertyId: 'property_a' }],
    ['tenants/tenant_a', { tenantId: 'tenant_a', ownerId: 'owner_a', propertyId: 'property_a' }],
    ['maintenanceTickets/ticket_a', { tenantId: 'tenant_a', ownerId: 'owner_a', assignedTechnicianId: 'tech_a', propertyId: 'property_a', status: 'ASSIGNED' }],
    ['technician_live_locations/tech_a', { technicianUid: 'tech_a', activeTicketId: 'ticket_a', lat: 24.45, lng: 54.37 }],
    ['inspections/inspection_a', { tenantId: 'tenant_a', ownerId: 'owner_a', propertyId: 'property_a', status: 'SUBMITTED' }],
    ['propertyInspections/property_inspection_a', { tenantId: 'tenant_a', ownerId: 'owner_a', ownerUid: 'owner_a', propertyId: 'property_a', ownerReviewStatus: 'PENDING', evidenceHash: 'immutable-evidence' }],
    ['payments/payment_a', { payerId: 'tenant_a', ownerId: 'owner_a', status: 'PENDING' }],
    ['payment_transactions/transaction_a', { payerId: 'tenant_a', ownerId: 'owner_a', paymentVerified: false, status: 'PENDING' }],
    ['design_quotes/design_quote_a', { userId: 'tenant_a', tenantId: 'tenant_a', ownerId: 'owner_a', status: 'ISSUED' }],
    ['owner_portfolio_quotes/portfolio_quote_a', { ownerId: 'owner_a', quoteHash: 'server-hash', amount: 1000 }],
    ['contracts/contract_a', { ownerId: 'owner_a', status: 'PENDING' }],
    ['broker_kyc_profiles/broker_a', { brokerId: 'broker_a', status: 'PENDING_REVIEW' }],
    ['audit_logs/audit_a', { actorId: 'server', action: 'PHASE10_FIXTURE' }],
    ['launch_evidence/evidence_a', { releaseSha: 'fixture', source: 'server' }],
    ['private_hr_profiles/staff_a', { uid: 'staff_a', salary: 1 }],
    ['system_payment_config/current', { status: 'ACTIVE', approvedMethods: ['CASH', 'CHEQUE'] }],
    ['system_health/admin_summaries', { status: 'READY' }],
  ];
  for (const [path, data] of records) await seed(path, data);
}

describe('Phase 10 Firestore full audit matrix', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedMatrix();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('denies unauthenticated reads and writes across launch-sensitive collections', async () => {
    const { anon } = contexts();
    const paths = [
      'owners/owner_a',
      'properties/property_a',
      'intake_submissions/intake_a',
      'units/unit_a',
      'tenants/tenant_a',
      'maintenanceTickets/ticket_a',
      'technician_live_locations/tech_a',
      'inspections/inspection_a',
      'propertyInspections/property_inspection_a',
      'payments/payment_a',
      'payment_transactions/transaction_a',
      'design_quotes/design_quote_a',
      'owner_portfolio_quotes/portfolio_quote_a',
      'contracts/contract_a',
      'broker_kyc_profiles/broker_a',
      'audit_logs/audit_a',
      'launch_evidence/evidence_a',
      'private_hr_profiles/staff_a',
      'system_payment_config/current',
      'system_health/admin_summaries',
    ];
    for (const path of paths) {
      await assertFails(getDoc(doc(anon, path)));
      await assertFails(setDoc(doc(anon, path + '_anon'), { forged: true }));
    }
  });

  it('enforces owner, tenant, technician and broker read isolation', async () => {
    const { ownerA, ownerB, tenantA, tenantB, techA, brokerA, brokerB } = contexts();

    await assertSucceeds(getDoc(doc(ownerA, 'owners/owner_a')));
    await assertFails(getDoc(doc(ownerB, 'owners/owner_a')));
    await assertSucceeds(getDoc(doc(ownerA, 'properties/property_a')));
    await assertFails(getDoc(doc(ownerB, 'properties/property_a')));
    await assertSucceeds(getDoc(doc(ownerA, 'intake_submissions/intake_a')));
    await assertFails(getDoc(doc(ownerB, 'intake_submissions/intake_a')));

    await assertSucceeds(getDoc(doc(tenantA, 'units/unit_a')));
    await assertFails(getDoc(doc(tenantB, 'units/unit_a')));
    await assertSucceeds(getDoc(doc(tenantA, 'tenants/tenant_a')));
    await assertFails(getDoc(doc(tenantB, 'tenants/tenant_a')));
    await assertSucceeds(getDoc(doc(tenantA, 'maintenanceTickets/ticket_a')));
    await assertFails(getDoc(doc(tenantB, 'maintenanceTickets/ticket_a')));
    await assertSucceeds(getDoc(doc(techA, 'maintenanceTickets/ticket_a')));

    await assertSucceeds(getDoc(doc(brokerA, 'broker_kyc_profiles/broker_a')));
    await assertFails(getDoc(doc(brokerB, 'broker_kyc_profiles/broker_a')));
  });

  it('keeps canonical GPS, finance, quote, audit, HR and system authority server-only', async () => {
    const { ownerA, tenantA, techA, admin, founder, hr } = contexts();

    await assertSucceeds(getDoc(doc(admin, 'technician_live_locations/tech_a')));
    for (const db of [techA, admin, founder]) {
      await assertFails(updateDoc(doc(db, 'technician_live_locations/tech_a'), { lat: 25 }));
      await assertFails(deleteDoc(doc(db, 'technician_live_locations/tech_a')));
    }

    for (const path of [
      'payments/payment_a',
      'payment_transactions/transaction_a',
      'design_quotes/design_quote_a',
      'owner_portfolio_quotes/portfolio_quote_a',
      'system_payment_config/current',
    ]) {
      for (const db of [ownerA, tenantA, admin, founder]) {
        await assertFails(updateDoc(doc(db, path), { forged: true }));
        await assertFails(deleteDoc(doc(db, path)));
      }
    }
    await assertFails(getDoc(doc(admin, 'owner_portfolio_quotes/portfolio_quote_a')));
    await assertFails(getDoc(doc(founder, 'system_payment_config/current')));

    await assertSucceeds(getDoc(doc(admin, 'audit_logs/audit_a')));
    await assertSucceeds(getDoc(doc(founder, 'audit_logs/audit_a')));
    await assertFails(getDoc(doc(ownerA, 'audit_logs/audit_a')));
    await assertFails(setDoc(doc(admin, 'audit_logs/browser_forged'), { action: 'FORGED' }));

    for (const db of [ownerA, admin, founder, hr]) {
      await assertFails(getDoc(doc(db, 'private_hr_profiles/staff_a')));
      await assertFails(setDoc(doc(db, 'private_hr_profiles/browser_forged'), { salary: 999 }));
    }
  });

  it('allows only the owning Owner to review property inspection evidence fields', async () => {
    const { ownerA, ownerB, admin, tenantA } = contexts();
    const refA = doc(ownerA, 'propertyInspections/property_inspection_a');

    await assertSucceeds(getDoc(refA));
    await assertFails(getDoc(doc(ownerB, 'propertyInspections/property_inspection_a')));
    await assertFails(getDoc(doc(tenantA, 'propertyInspections/property_inspection_a')));
    await assertSucceeds(getDoc(doc(admin, 'propertyInspections/property_inspection_a')));

    await assertSucceeds(updateDoc(refA, {
      ownerReviewStatus: 'APPROVED',
      ownerReviewNotes: 'Reviewed',
      ownerReviewedAt: new Date(),
    }));
    await assertFails(updateDoc(refA, { evidenceHash: 'forged' }));
    await assertFails(updateDoc(doc(admin, 'propertyInspections/property_inspection_a'), { evidenceHash: 'admin-forged' }));
    await assertFails(deleteDoc(refA));
    await assertFails(setDoc(doc(ownerA, 'propertyInspections/owner_created'), {
      ownerId: 'owner_a',
      ownerReviewStatus: 'APPROVED',
    }));
  });

  it('keeps payment, contract and broker KYC mutation paths fail-closed in browser clients', async () => {
    const { ownerA, tenantA, brokerA, admin } = contexts();
    await assertFails(updateDoc(doc(ownerA, 'contracts/contract_a'), { status: 'ACTIVE' }));
    await assertFails(setDoc(doc(tenantA, 'payment_transactions/client_created'), {
      payerId: 'tenant_a',
      paymentVerified: true,
    }));
    await assertFails(updateDoc(doc(brokerA, 'broker_kyc_profiles/broker_a'), { status: 'APPROVED' }));
    await assertFails(updateDoc(doc(admin, 'broker_kyc_profiles/broker_a'), { status: 'APPROVED' }));
  });

  it('launch evidence is readable by Admin/Founder but browser clients cannot forge protected provenance', async () => {
    const { ownerA, admin, founder } = contexts();
    await assertSucceeds(getDoc(doc(admin, 'launch_evidence/evidence_a')));
    await assertSucceeds(getDoc(doc(founder, 'launch_evidence/evidence_a')));
    await assertFails(getDoc(doc(ownerA, 'launch_evidence/evidence_a')));

    await assertSucceeds(setDoc(doc(admin, 'launch_evidence/manual_note'), {
      source: 'admin-manual-evidence',
      executionGenerated: false,
      hardLaunchClaim: false,
    }));
    await assertFails(setDoc(doc(admin, 'launch_evidence/forged_workflow'), {
      source: 'github-actions',
      executionGenerated: true,
      hardLaunchClaim: true,
    }));
    await assertFails(updateDoc(doc(admin, 'launch_evidence/evidence_a'), { hardLaunchClaim: true }));
    await assertFails(deleteDoc(doc(admin, 'launch_evidence/evidence_a')));
  });
});

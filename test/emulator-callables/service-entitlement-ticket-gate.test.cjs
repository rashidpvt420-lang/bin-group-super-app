'use strict';
// Revenue gate: owner and tenant maintenance tickets (and the automatic dispatch they trigger)
// require an ACTIVE owner service contract whose payment was verified by finance.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { ownerCreateMaintenanceTicket, createTenantServiceTicket, createAiMaintenanceTicket, autoRouteTicket } = lib('runtimeAll.js');
const { contractGrantsService } = lib('propertyServiceEntitlement.js');

const OWNER = 'owner_entitlement';
const TENANT = 'tenant_entitlement';
const owner = { uid: OWNER, token: { role: 'owner', email: 'owner.entitlement@example.invalid', email_verified: true } };
const tenant = { uid: TENANT, token: { role: 'tenant', email: 'tenant.entitlement@example.invalid', email_verified: true } };
const verifiedAt = admin.firestore.Timestamp.fromMillis(Date.parse('2026-09-01T08:00:00Z'));
const PAID = { ownerId: OWNER, ownerUid: OWNER, status: 'ACTIVE', contractStatus: 'active', paymentVerified: true, paymentStatus: 'APPROVED' };

async function seed({ contract, propertyExtra = { contractId: 'c_ent' }, ownerProfile = {} } = {}) {
  await db.doc(`users/${OWNER}`).set({ role: 'owner', status: 'active', ...ownerProfile });
  await db.doc(`users/${TENANT}`).set({ role: 'tenant', status: 'active', email: tenant.token.email });
  if (contract) await db.doc('contracts/c_ent').set(contract);
  await db.doc('properties/p_ent').set({
    name: 'Entitlement Villa', ownerId: OWNER, ownerUid: OWNER, units: 1, propertyType: 'Villa', status: 'ACTIVE',
    emirate: 'Dubai', city: 'Dubai', area: 'Marina', address: 'Marina Walk, Dubai',
    geo: { lat: 25.0802, lng: 55.1403, emirate: 'Dubai', city: 'Dubai', area: 'Marina', address: 'Marina Walk, Dubai',
      verified: true, dispatchReady: true, verifiedBy: 'founder_uid', verifiedAt, verificationVersion: 1, source: 'admin_manual' },
    geoVerification: { state: 'VERIFIED', verifiedBy: 'founder_uid', verifiedAt, verificationVersion: 1, source: 'FOUNDER_MFA_REVIEW' },
    ...propertyExtra,
  });
  await db.doc('units/u_ent').set({ propertyId: 'p_ent', tenantId: TENANT, tenantUid: TENANT, unitNumber: '1' });
}
const ownerTicket = () => call(ownerCreateMaintenanceTicket, owner, { propertyId: 'p_ent', category: 'AC / Cooling', priority: 'normal', description: 'AC is not cooling at all' });
const tenantTicket = (id) => call(createTenantServiceTicket, tenant, { kind: 'EMERGENCY', unitId: 'u_ent', propertyId: 'p_ent', clientRequestId: id, details: { category: 'AC', description: 'AC is not cooling at all' } });
const tickets = async () => (await db.collection('maintenanceTickets').get()).size;

test.before(async () => {
  await createUser(OWNER, { role: 'owner' }, { email: owner.token.email });
  await createUser(TENANT, { role: 'tenant' }, { email: tenant.token.email });
});
test.beforeEach(clearFirestore);

test('active, finance-verified contract allows owner and tenant tickets', async () => {
  await seed({ contract: PAID });
  await ownerTicket();
  const result = await tenantTicket('entitlement-active-0001');
  assert.equal(result.status, 'SUCCESS');
  assert.equal(await tickets(), 2);
});

for (const [label, contract] of [
  ['no contract', undefined],
  ['unpaid contract', { ...PAID, paymentVerified: false, paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION' }],
  ['closed contract', { ...PAID, status: 'CLOSED', contractStatus: 'CLOSED' }],
  ['payment rejected', { ...PAID, status: 'PAYMENT_REJECTED', paymentStatus: 'REJECTED' }],
  ['contract of another owner', { ...PAID, ownerId: 'someone_else', ownerUid: 'someone_else' }],
]) {
  test(`${label}: owner and tenant tickets are refused and nothing is dispatched`, async () => {
    await seed({ contract });
    const error = await expectHttpsError(ownerTicket(), 'failed-precondition');
    assert.equal(error.details?.reason, 'SERVICE_CONTRACT_INACTIVE');
    await expectHttpsError(tenantTicket('entitlement-blocked-0001'), 'failed-precondition');
    assert.equal(await tickets(), 0);
  });
}

test('owner activeContractId covering the property (adminApprovePayment shape) is accepted', async () => {
  await seed({ contract: { ...PAID, propertyIds: ['p_ent'] }, propertyExtra: {}, ownerProfile: { activeContractId: 'c_ent' } });
  await ownerTicket();
  assert.equal(await tickets(), 1);
});

test('owner activeContractId that does not cover the property is not accepted', async () => {
  await seed({ contract: { ...PAID, propertyIds: ['other_property'] }, propertyExtra: {}, ownerProfile: { activeContractId: 'c_ent' } });
  await expectHttpsError(ownerTicket(), 'failed-precondition');
});

test('contractGrantsService pure checks', () => {
  assert.equal(contractGrantsService(PAID, OWNER), true);
  assert.equal(contractGrantsService({ ...PAID, paymentVerified: 'true' }, OWNER), false);
  assert.equal(contractGrantsService({ ...PAID, status: 'pending_approval', contractStatus: '' }, OWNER), false);
  assert.equal(contractGrantsService(undefined, OWNER), false);
});

const aiTicket = (actor) => call(createAiMaintenanceTicket, actor, { propertyId: 'p_ent', title: 'AC not cooling', description: 'AC is not cooling at all', trade: 'HVAC' });
const adminActor = { uid: 'admin_entitlement', token: { role: 'admin', admin: true, email: 'admin.entitlement@example.invalid', email_verified: true } };

test('owner AI ticket needs the paid contract; admin AI ticket is not gated', async () => {
  await seed({ contract: undefined });
  const error = await expectHttpsError(aiTicket(owner), 'failed-precondition');
  assert.equal(error.details?.reason, 'SERVICE_CONTRACT_INACTIVE');
  assert.equal(await tickets(), 0);
  const adminResult = await aiTicket(adminActor);
  assert.equal(adminResult.status, 'SUCCESS');
  await db.doc('contracts/c_ent').set(PAID);
  const ownerResult = await aiTicket(owner);
  assert.equal(ownerResult.status, 'SUCCESS');
  assert.equal(await tickets(), 2);
});

test('public WhatsApp intake is never auto-dispatched; it goes to a coordinator', async () => {
  await db.doc('technicians/tech_wa').set({ role: 'technician', status: 'ACTIVE', onDuty: true, emirate: 'Dubai', skills: ['GENERAL'] });
  await db.doc('maintenanceTickets/wa_ticket').set({ title: 'Leak', propertyRef: 'Villa 9', priority: 'HIGH', status: 'OPEN', source: 'whatsapp', reporterPhone: '+971500000000', emirate: 'Dubai' });
  const snap = await db.doc('maintenanceTickets/wa_ticket').get();
  await autoRouteTicket.run({ data: snap, params: { ticketId: 'wa_ticket' } });
  const ticket = (await db.doc('maintenanceTickets/wa_ticket').get()).data();
  assert.equal(ticket.dispatchStatus, 'PENDING_MANUAL_DISPATCH');
  assert.equal(ticket.assignmentReasonCode, 'SERVICE_CONTRACT_UNVERIFIED');
  assert.ok(!ticket.assignedTechnicianId);
});

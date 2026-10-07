'use strict';
// Regression: a tenant AC complaint never reached a technician. Auto-dispatch compared only
// users.emirate (never written for technicians; HR stores technicians.primaryEmirate /
// emiratesCovered) and a raw substring of users.trade (default "General Maintenance"; HR stores
// specialization/primaryTrade). Matching now reads both registries and normalises emirates and
// trades, without relaxing approval, suspension, duty, availability or capacity checks.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, clearFirestore } = require('./_setup.cjs');

const { autoRouteTicket } = lib('runtimeAll.js');
const matching = lib('technicianDispatchMatching.js');

const TENANT = 'tenant_dispatch_match';
const TECH = 'tech_dispatch_match';
const TICKET = 'ticket_dispatch_match';

function userProfile(overrides = {}) {
  return {
    uid: TECH, role: 'technician', displayName: 'Dispatch Tech', status: 'ACTIVE', suspended: false,
    onDuty: true, dutyStatus: 'ON_DUTY', isAvailable: true, available: true, currentJobCount: 0,
    specialization: 'General Maintenance', trade: 'General Maintenance', ...overrides,
  };
}
function technicianProfile(overrides = {}) {
  return {
    uid: TECH, role: 'technician', status: 'ACTIVE', approvalStatus: 'APPROVED', suspended: false,
    primaryEmirate: 'Dubai', emiratesCovered: ['Dubai'], specialization: 'HVAC Technician', maxConcurrentJobs: 3,
    ...overrides,
  };
}

async function seed({ user = {}, technician = {}, ticket = {} } = {}) {
  await db.doc('properties/property_dispatch_match').set({
    name: 'Dispatch Match Tower', ownerId: 'owner_dispatch_match', emirate: 'Dubai', city: 'Dubai', area: 'Marina',
    geo: { lat: 25.0802, lng: 55.1403, emirate: 'Dubai', city: 'Dubai', area: 'Marina', address: 'Marina, Dubai', verified: true },
  });
  await db.doc('units/unit_dispatch_match').set({ propertyId: 'property_dispatch_match', tenantId: TENANT, tenantUid: TENANT, unitNumber: '1201' });
  await db.doc(`users/${TENANT}`).set({ role: 'tenant', displayName: 'Tenant Match' });
  await db.doc(`users/${TECH}`).set(userProfile(user));
  await db.doc(`technicians/${TECH}`).set(technicianProfile(technician));
  await db.doc(`maintenanceTickets/${TICKET}`).set({
    requesterRole: 'tenant', source: 'TENANT_SERVICE_TICKET_CALLABLE', tenantId: TENANT, tenantUid: TENANT,
    propertyId: 'property_dispatch_match', unitId: 'unit_dispatch_match', category: 'AC', priority: 'normal',
    description: 'AC is not cooling in the master bedroom', status: 'OPEN', dispatchStatus: 'PENDING_ASSIGNMENT',
    photoEvidenceRequired: true, evidenceStatus: 'TENANT_EVIDENCE_UPLOADED', assignedTechnicianId: null, technicianId: null,
    ...ticket,
  });
}

async function route() {
  const snap = await db.doc(`maintenanceTickets/${TICKET}`).get();
  await autoRouteTicket.run({ data: snap, params: { ticketId: TICKET } });
  return (await db.doc(`maintenanceTickets/${TICKET}`).get()).data();
}

test.beforeEach(clearFirestore);

test('AC complaint is auto-assigned to an HVAC technician whose emirate is recorded only on technicians/{uid}', async () => {
  await seed();
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, TECH);
  assert.equal(ticket.status, 'ASSIGNED');
  assert.equal(ticket.dispatchStatus, 'AUTO_ASSIGNED');
  assert.equal((await db.doc(`users/${TECH}`).get()).data().currentJobCount, 1);
});

for (const [label, specialization] of [['A/C', 'A/C Technician'], ['A-C', 'A-C repair'], ['air conditioning', 'Air Conditioning'], ['cooling', 'Cooling systems'], ['HVAC primaryTrade', null]]) {
  test(`technician trade "${label}" qualifies for an AC complaint`, async () => {
    await seed({ technician: specialization ? { specialization } : { specialization: '', primaryTrade: 'HVAC' } });
    assert.equal((await route()).assignedTechnicianId, TECH);
  });
}

test('emiratesCovered list (comma string) is honoured', async () => {
  await seed({ technician: { primaryEmirate: 'Sharjah', emiratesCovered: 'Sharjah, DXB' } });
  assert.equal((await route()).assignedTechnicianId, TECH);
});

test('technician outside the property emirate is not auto-assigned', async () => {
  await seed({ technician: { primaryEmirate: 'Sharjah', emiratesCovered: ['Sharjah'] } });
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, null);
  assert.equal(ticket.status, 'OPEN');
});

test('a General Maintenance or plumbing technician is not treated as qualified for AC', async () => {
  await seed({ technician: { specialization: 'Plumbing' } });
  assert.equal((await route()).assignedTechnicianId, null);
});

test('security gates are unchanged: off duty, on break, suspended, unapproved and full technicians are skipped', async () => {
  for (const overrides of [
    { user: { onDuty: false } },
    { user: { isAvailable: false, available: false, dutyStatus: 'ON_BREAK' } },
    { user: { suspended: true } },
    { user: { status: 'INVITED' }, technician: { status: 'INVITED', approvalStatus: 'PENDING' } },
    { technician: { status: 'SUSPENDED' } },
    { user: { currentJobCount: 3 } },
  ]) {
    await clearFirestore();
    await seed(overrides);
    assert.equal((await route()).assignedTechnicianId, null, JSON.stringify(overrides));
  }
});

test('normalisation helpers map trade and emirate aliases without loose substring matches', () => {
  for (const value of ['AC', 'ac', 'A/C', 'A-C', 'A.C', 'HVAC', 'Air Conditioning', 'air-conditioning', 'AC / Cooling', 'Cooling']) {
    assert.ok(matching.canonicalTrades(value).includes('hvac'), value);
  }
  for (const value of ['Facade cleaning', 'General Maintenance', 'Electrical', 'Plumbing']) {
    assert.ok(!matching.canonicalTrades(value).includes('hvac'), value);
  }
  assert.equal(matching.requiredTicketTrade({ category: 'AC' }), 'hvac');
  assert.equal(matching.requiredTicketTrade({ category: 'emergency' }), null);
  assert.equal(matching.requiredTicketTrade({ category: 'other' }), 'general');
  assert.equal(matching.normalizeEmirate('DXB'), 'dubai');
  assert.equal(matching.normalizeEmirate('Ras Al Khaimah'), 'ras_al_khaimah');
  const result = matching.evaluateTechnicianForTicket({ user: { onDuty: true, status: 'active' }, technician: {}, ticketEmirate: 'Dubai', requiredTrade: 'hvac' });
  assert.deepEqual(result.reasons.sort(), ['emirate_not_covered', 'trade_not_qualified']);
});

'use strict';
// Regression: an owner complaint on a single-unit villa (property declares units: 1, no units
// record) was stored with unitId/unitNumber null and adminAssignTechnician then hard-failed
// "Ticket must be linked to a property and unit before dispatch." forever. Owner tickets are also
// shown to flow through the same automatic dispatch trigger as tenant tickets.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const { ownerCreateMaintenanceTicket, adminAssignTechnician, autoRouteTicket } = runtime;

const OWNER = 'owner_unit_scope';
const OTHER_OWNER = 'owner_unit_scope_other';
const TECH = 'tech_unit_scope';
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const owner = { uid: OWNER, token: { role: 'owner', email: 'owner.unit.scope@example.invalid', email_verified: true } };
const future = () => admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 86400000);

function verifiedProperty(overrides = {}) {
  const verifiedAt = admin.firestore.Timestamp.fromMillis(Date.now() - 86400000);
  return {
    ownerId: OWNER, ownerUid: OWNER, name: 'Unit Scope Villa', status: 'ACTIVE', activationStatus: 'ACTIVE',
    emirate: 'Abu Dhabi', city: 'Al Ain', area: 'Al Ain', address: 'Villa 1, Al Ain, UAE',
    geo: {
      lat: 24.2017, lng: 55.7372, verified: true, dispatchReady: true, verifiedBy: 'founder_uid', verifiedAt,
      verificationVersion: 1, source: 'admin_manual', emirate: 'Abu Dhabi', city: 'Al Ain', area: 'Al Ain', address: 'Villa 1, Al Ain, UAE',
    },
    geoVerification: { state: 'VERIFIED', verifiedBy: 'founder_uid', verifiedAt, verificationVersion: 1, source: 'FOUNDER_MFA_REVIEW' },
    ...overrides,
  };
}

function readyTechnician(overrides = {}) {
  return {
    uid: TECH, role: 'technician', status: 'active', approvalStatus: 'approved', displayName: 'Unit Scope Tech',
    medicalCardStatus: 'valid', medicalCardExpiry: future(), drivingLicenseStatus: 'valid', drivingLicenseExpiry: future(),
    certifications: [{ name: 'HVAC', status: 'valid', expiryAt: future() }],
    deviceRegistered: true, registeredDeviceId: 'device-unit-scope', onDuty: true, dutyStatus: 'ON_DUTY', currentShiftId: 'shift_unit_scope',
    isAvailable: true, available: true, lastGpsAt: admin.firestore.Timestamp.now(), currentJobCount: 0,
    emirate: 'Abu Dhabi', trade: 'AC / Cooling', ...overrides,
  };
}

const complaint = (overrides = {}) => ({ category: 'AC / Cooling', priority: 'normal', description: 'Room AC is not working', specificLocation: 'Bedroom', ...overrides });
const ticket = async (id) => (await db.doc(`maintenanceTickets/${id}`).get()).data();

let dispatcher;
test.before(async () => {
  await createUser(OWNER, { role: 'owner' }, { email: owner.token.email });
  await createUser(TECH, { role: 'technician' });
  dispatcher = await createUser('dispatcher_unit_scope', { role: 'operations_admin', admin: true }, { tokenExtra: MFA });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc(`users/${TECH}`).set(readyTechnician());
  await db.doc(`technicians/${TECH}`).set(readyTechnician());
});

test('single-unit villa with units:1 and no units record: whole-property ticket is created and manually assignable', async () => {
  await db.doc('properties/villa_no_units').set(verifiedProperty({ units: 1, propertyType: 'Villa' }));
  const created = await call(ownerCreateMaintenanceTicket, owner, { propertyId: 'villa_no_units', ...complaint() });
  const stored = await ticket(created.ticketId);
  assert.equal(stored.unitId, null);
  assert.equal(stored.unitScope, 'WHOLE_PROPERTY');

  const assigned = await call(adminAssignTechnician, dispatcher, { ticketId: created.ticketId, technicianId: TECH });
  assert.equal(assigned.status, 'ASSIGNED');
  const after = await ticket(created.ticketId);
  assert.equal(after.assignedTechnicianId, TECH);
  assert.equal(after.unitScope, 'WHOLE_PROPERTY');
});

test('legacy unit-less owner ticket on a units:1 villa (live shape) is now assignable', async () => {
  await db.doc('properties/villa_legacy').set(verifiedProperty({ units: 1 }));
  await db.doc('maintenanceTickets/legacy_unitless').set({
    requesterRole: 'owner', ownerId: OWNER, ownerUid: OWNER, propertyId: 'villa_legacy', unitId: null, unitNumber: null,
    category: 'AC / Cooling', status: 'OPEN', dispatchStatus: 'PENDING_ASSIGNMENT', assignedTechnicianId: null, source: 'OWNER_PORTAL_CALLABLE',
  });
  const assigned = await call(adminAssignTechnician, dispatcher, { ticketId: 'legacy_unitless', technicianId: TECH });
  assert.equal(assigned.status, 'ASSIGNED');
});

test('the only units record of a single-unit property is auto-selected and linked', async () => {
  await db.doc('properties/villa_one_unit').set(verifiedProperty({ units: 1 }));
  await db.doc('units/villa_one_unit_1').set({ propertyId: 'villa_one_unit', unitNumber: '1', ownerId: OWNER });
  const created = await call(ownerCreateMaintenanceTicket, owner, { propertyId: 'villa_one_unit', ...complaint() });
  const stored = await ticket(created.ticketId);
  assert.equal(stored.unitId, 'villa_one_unit_1');
  assert.equal(stored.unitNumber, '1');
  assert.equal(stored.unitAutoSelected, true);
  assert.equal(stored.unitScope, 'UNIT');
  assert.equal((await call(adminAssignTechnician, dispatcher, { ticketId: created.ticketId, technicianId: TECH })).status, 'ASSIGNED');

  // A legacy unit-less ticket on the same property is linked to that unit when assigned.
  await db.doc('maintenanceTickets/legacy_one_unit').set({ ownerId: OWNER, propertyId: 'villa_one_unit', unitId: null, status: 'OPEN', category: 'AC / Cooling' });
  await db.doc(`users/${TECH}`).set(readyTechnician({ currentJobCount: 0 }));
  await call(adminAssignTechnician, dispatcher, { ticketId: 'legacy_one_unit', technicianId: TECH });
  const linked = await ticket('legacy_one_unit');
  assert.equal(linked.unitId, 'villa_one_unit_1');
  assert.equal(linked.unitScope, 'WHOLE_PROPERTY');
});

test('multi-unit property still requires a unit (or explicit common area) and unit-less dispatch stays blocked', async () => {
  await db.doc('properties/tower').set(verifiedProperty({ units: 4, propertyType: 'Building' }));
  await db.doc('units/tower_101').set({ propertyId: 'tower', unitNumber: '101', ownerId: OWNER });
  await db.doc('units/tower_102').set({ propertyId: 'tower', unitNumber: '102', ownerId: OWNER });

  await expectHttpsError(call(ownerCreateMaintenanceTicket, owner, { propertyId: 'tower', ...complaint() }), 'invalid-argument');
  const common = await call(ownerCreateMaintenanceTicket, owner, { propertyId: 'tower', serviceScope: 'COMMON_AREA', ...complaint() });
  assert.equal((await ticket(common.ticketId)).unitScope, 'COMMON_AREA');
  const blocked = await expectHttpsError(call(adminAssignTechnician, dispatcher, { ticketId: common.ticketId, technicianId: TECH }), 'failed-precondition');
  assert.match(blocked.message, /linked to a property and unit/);

  const withUnit = await call(ownerCreateMaintenanceTicket, owner, { propertyId: 'tower', unitId: 'tower_101', ...complaint() });
  assert.equal((await call(adminAssignTechnician, dispatcher, { ticketId: withUnit.ticketId, technicianId: TECH })).status, 'ASSIGNED');
});

test('unit-less dispatch is refused for undeclared unit counts, missing properties and owner mismatches', async () => {
  await db.doc('properties/unknown_count').set(verifiedProperty());
  await db.doc('properties/villa_other_owner').set(verifiedProperty({ units: 1, ownerId: OTHER_OWNER, ownerUid: OTHER_OWNER }));
  for (const [id, propertyId] of [['t_unknown', 'unknown_count'], ['t_missing', 'no_such_property'], ['t_mismatch', 'villa_other_owner']]) {
    await db.doc(`maintenanceTickets/${id}`).set({ ownerId: OWNER, propertyId, unitId: null, status: 'OPEN', category: 'AC / Cooling' });
    await expectHttpsError(call(adminAssignTechnician, dispatcher, { ticketId: id, technicianId: TECH }), 'failed-precondition');
    assert.equal((await ticket(id)).assignedTechnicianId, undefined);
  }
  // Owners still cannot file against someone else's property.
  await expectHttpsError(call(ownerCreateMaintenanceTicket, owner, { propertyId: 'villa_other_owner', ...complaint() }), 'permission-denied');
});

test('owner-created tickets go through the same automatic dispatch trigger as tenant tickets', async () => {
  await db.doc('properties/villa_auto').set(verifiedProperty({ units: 1 }));
  const created = await call(ownerCreateMaintenanceTicket, owner, { propertyId: 'villa_auto', ...complaint() });
  const ref = db.doc(`maintenanceTickets/${created.ticketId}`);
  await autoRouteTicket.run({ data: await ref.get(), params: { ticketId: created.ticketId } });
  const routed = await ticket(created.ticketId);
  assert.equal(routed.assignedTechnicianId, TECH);
  assert.equal(routed.dispatchStatus, 'AUTO_ASSIGNED');
});

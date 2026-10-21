'use strict';
// Feature 5: automatic vacancy (gated) and one-tap listing prefill with real maintenance history.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');
const { ownerPrepareUnitListing } = lib('runtimeAll.js');
const uv = lib('unitVacancy.js');
const owner = { uid: 'o_vac', token: { role: 'owner', email: 'o@example.invalid', email_verified: true } };
const other = { uid: 'o_x', token: { role: 'owner', email: 'x@example.invalid', email_verified: true } };

test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('properties/p1').set({ ownerId: 'o_vac', propertyName: 'Palm Tower', emirate: 'Abu Dhabi', area: 'Al Reem', address: '1 Palm St', amenities: ['Pool', 'Gym'] });
  await db.doc('units/u1').set({ propertyId: 'p1', unitNumber: '1204', bedrooms: 2, bathrooms: 2, areaSqFt: 1100, tenantId: 't1', occupancyStatus: 'OCCUPIED' });
  await db.doc('leases/l1').set({ ownerId: 'o_vac', tenantId: 't1', unitId: 'u1', leaseEndDate: '2026-01-31', annualRent: 90000 });
  await db.doc('maintenanceTickets/m1').set({ unitId: 'u1', category: 'AC service', status: 'COMPLETED', completedAt: '2026-09-30T10:00:00Z' });
  await db.doc('maintenanceTickets/m2').set({ unitId: 'u1', category: 'Plumbing', status: 'OPEN', updatedAt: '2026-10-01T10:00:00Z' });
});

test('shouldMarkVacant respects renewals and new tenants', () => {
  assert.equal(uv.shouldMarkVacant({ leaseEndDate: '2026-01-31', tenantId: 't1' }, { tenantId: 't1' }, '2026-10-21'), true);
  assert.equal(uv.shouldMarkVacant({ leaseEndDate: '2026-01-31', tenantId: 't1', renewalStatus: 'RENEWED' }, { tenantId: 't1' }, '2026-10-21'), false);
  assert.equal(uv.shouldMarkVacant({ leaseEndDate: '2026-01-31', tenantId: 't1' }, { tenantId: 't2' }, '2026-10-21'), false);
  assert.equal(uv.shouldMarkVacant({ leaseEndDate: '2027-01-31', tenantId: 't1' }, { tenantId: 't1' }, '2026-10-21'), false);
  assert.equal(uv.shouldMarkVacant({}, { tenantId: 't1' }, '2026-10-21'), false);
});

test('sweep changes nothing while the flag is off, then marks VACANT when enabled', async () => {
  const off = await uv.runEndedLeaseVacancySweep(new Date('2026-10-21T08:00:00Z'));
  assert.deepEqual(off, { checked: 1, eligible: 1, applied: 0, autoVacateEnabled: false });
  assert.equal((await db.doc('units/u1').get()).data().occupancyStatus, 'OCCUPIED');
  assert.ok((await db.doc('notifications/vacancy_prompt_u1_2026-01-31').get()).exists);
  await db.doc('system_config/vacancy').set({ autoVacateEnabled: true });
  const on = await uv.runEndedLeaseVacancySweep(new Date('2026-10-21T08:00:00Z'));
  assert.equal(on.applied, 1);
  assert.equal((await db.doc('units/u1').get()).data().occupancyStatus, 'VACANT');
  assert.equal((await db.doc('leases/l1').get()).data().leaseStatus, 'ended');
});

test('prefill comes from unit, property, lease and completed tickets only', async () => {
  const r = await call(ownerPrepareUnitListing, owner, { unitId: 'u1' });
  assert.equal(r.prefill.unitTitle, 'Palm Tower · Unit 1204');
  assert.equal(r.prefill.emirate, 'ABU_DHABI');
  assert.equal(r.prefill.annualRent, 90000);
  assert.equal(r.prefill.amenitiesText, 'Pool, Gym');
  assert.equal(r.maintenanceHistory.length, 1);
  assert.equal(r.maintenanceHistory[0].category, 'AC service');
  await expectHttpsError(call(ownerPrepareUnitListing, other, { unitId: 'u1' }), 'permission-denied');
});

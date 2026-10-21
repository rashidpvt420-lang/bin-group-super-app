'use strict';
// Feature 9: owner KPIs from server aggregates (no client limits).
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');
const { getOwnerKpis } = lib('runtimeAll.js');
const k = lib('ownerKpis.js');
const owner = { uid: 'o_kpi', token: { role: 'owner', email: 'o@example.invalid', email_verified: true } };
const tenant = { uid: 't1', token: { role: 'tenant', email: 't@example.invalid', email_verified: true } };

test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('properties/p1').set({ ownerId: 'o_kpi' });
  await db.doc('units/u1').set({ propertyId: 'p1', tenantId: 't1' });
  await db.doc('units/u2').set({ propertyId: 'p1' });
  const batch = db.batch();
  for (let i = 0; i < 160; i++) batch.set(db.doc(`maintenanceTickets/m${i}`), { ownerId: 'o_kpi', status: i < 155 ? 'ASSIGNED' : 'CLOSED', priority: i < 3 ? 'URGENT' : 'NORMAL' });
  await batch.commit();
  await db.doc('rent_installments/r1').set({ ownerId: 'o_kpi', dueDate: '2026-10-01', amount: 10000, status: 'PAID' });
  await db.doc('rent_installments/r2').set({ ownerId: 'o_kpi', dueDate: '2026-10-15', amount: 5000, status: 'OVERDUE' });
  await db.doc('leases/l1').set({ ownerId: 'o_kpi', leaseEndDate: '2026-12-01' });
  await db.doc('leases/l2').set({ ownerId: 'o_kpi', leaseEndDate: '2027-12-01' });
  await db.doc('owner_approval_requests/a1').set({ ownerId: 'o_kpi', status: 'PENDING' });
  await db.doc('owner_approval_requests/a2').set({ ownerId: 'o_kpi', status: 'APPROVED' });
});

test('KPIs count every record (beyond the old 150 limit) and carry per-KPI errors', async () => {
  const r = await k.computeOwnerKpis('o_kpi', new Date('2026-10-21T08:00:00Z'));
  assert.deepEqual(r.jobs, { value: { open: 155, urgent: 3 }, error: null });
  assert.deepEqual(r.rent.value, { due: 15000, collected: 10000, overdueInstallments: 1 });
  assert.deepEqual(r.occupancy.value, { occupied: 1, total: 2 });
  assert.equal(r.leasesExpiring90d.value, 1);
  assert.equal(r.approvalsWaiting.value, 1);
  await expectHttpsError(call(getOwnerKpis, tenant, {}), 'permission-denied');
  assert.ok((await call(getOwnerKpis, owner, {})).jobs);
});

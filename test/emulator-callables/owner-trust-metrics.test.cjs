'use strict';
// Owner trust metrics: read-only ratios over the owner's own records; "not enough data" below the minimum; no writes.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { getOwnerTrustMetrics } = lib('runtimeAll.js');
const m = lib('ownerTrustMetrics.js');
let owner, otherOwner, tenant;
test.before(async () => {
  owner = await createUser('otm_owner', { role: 'owner' });
  otherOwner = await createUser('otm_owner2', { role: 'owner' });
  tenant = await createUser('otm_tenant', { role: 'tenant' });
});
test.beforeEach(clearFirestore);

test('pure ratios: insufficient below minimum, honest percentage above', () => {
  assert.equal(m.ratio('x', 2, 4).state, 'INSUFFICIENT_DATA');
  assert.equal(m.ratio('x', 2, 4).percent, null);
  assert.equal(m.ratio('x', 4, 5).percent, 80);
  const tickets = [
    ...Array.from({ length: 4 }, () => ({ status: 'COMPLETED', technicianAfterPhotoUrl: 'gs://a' })),
    { status: 'CLOSED', technicianAfterPhotos: [] },
    { status: 'OPEN' },
  ];
  assert.deepEqual([m.maintenanceEvidence(tickets).numerator, m.maintenanceEvidence(tickets).denominator], [4, 5]);
  const appr = [{ status: 'APPROVED' }, { status: 'REJECTED' }, { status: 'EMERGENCY_APPROVED' }, { status: 'APPROVED' }, { status: 'APPROVED' }, { status: 'PENDING' }];
  assert.equal(m.approvalDiscipline(appr).percent, 80);
  assert.equal(m.authorityCoverage([{ status: 'ACTIVE' }]).state, 'INSUFFICIENT_DATA');
});

test('owner sees metrics from own records only; empty owner gets not-enough-data; no writes', async () => {
  for (let i = 0; i < 5; i += 1) {
    await db.doc(`maintenanceTickets/otm_${i}`).set({ ownerId: 'otm_owner', status: 'COMPLETED', technicianAfterPhotoUrl: i < 3 ? 'gs://x' : '', finalCost: 100, approvalRequestId: i < 2 ? 'a1' : '', paymentId: 'p1' });
  }
  await db.doc('maintenanceTickets/otm_other').set({ ownerId: 'otm_owner2', status: 'COMPLETED', technicianAfterPhotoUrl: 'gs://y' });
  const res = await call(getOwnerTrustMetrics, owner, {});
  const byKey = Object.fromEntries(res.metrics.map((x) => [x.key, x]));
  assert.equal(byKey.maintenanceEvidence.percent, 60);
  assert.equal(byKey.financialTraceability.percent, 40);
  assert.equal(byKey.authorityCoverage.state, 'INSUFFICIENT_DATA');
  assert.equal(byKey.approvalDiscipline.state, 'INSUFFICIENT_DATA');
  const other = await call(getOwnerTrustMetrics, otherOwner, {});
  assert.ok(other.metrics.every((x) => x.state === 'INSUFFICIENT_DATA'));
  const collections = (await db.listCollections()).map((c) => c.id).sort();
  assert.deepEqual(collections, ['maintenanceTickets']);
});

test('only signed-in owners', async () => {
  await expectHttpsError(call(getOwnerTrustMetrics, null, {}), 'unauthenticated');
  await expectHttpsError(call(getOwnerTrustMetrics, tenant, {}), 'permission-denied');
});

'use strict';
// Production Control Center summary: real counts/money from Firestore, real Firestore probe,
// SMTP reported as not_configured (never faked operational), refresh gated by Admin + MFA.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const m = lib('controlCenterSummary.js');
const MFA = { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };

let adminMfa, adminNoMfa, owner;
test.before(async () => {
  adminMfa = await createUser('admin_ccs_mfa', { role: 'admin', admin: true }, MFA);
  adminNoMfa = await createUser('admin_ccs_nomfa', { role: 'admin', admin: true });
  owner = await createUser('owner_ccs', { role: 'owner' });
});
test.beforeEach(clearFirestore);

async function seed() {
  await db.doc('propertyPassports/p1').set({ totalUnits: 4 });
  await db.doc('propertyPassports/p2').set({ totalUnits: 6 });
  await db.doc('users/t1').set({ role: 'tenant' });
  await db.doc('users/t2').set({ role: 'tenant' });
  await db.doc('users/s1').set({ role: 'support_admin' });
  await db.doc('tenant_invitations/i1').set({ status: 'failed' });
  await db.doc('tenant_invitations/i2').set({ status: 'sent' });
  await db.doc('maintenanceTickets/k1').set({ status: 'OPEN' });
  await db.doc('maintenanceTickets/k2').set({ status: 'CLOSED' });
  await db.doc('payment_transactions/x1').set({ recordType: 'OWNER_RENT_PAYMENT', paymentStatus: 'VERIFIED', amount: 1000, rentDue: 1500, rentPaid: 1000 });
  await db.doc('contracts/c1').set({ status: 'ACTIVE', annualRent: 60000 });
}

test('summary job writes real counts, ledger money and real health checks', async () => {
  await seed();
  await m.writeControlCenterSummary();
  const snap = await db.doc('system_health/control_center_summary').get();
  const s = snap.data();
  assert.equal(s.metrics.totalProperties, 2);
  assert.equal(s.metrics.totalUnits, 10);
  assert.equal(s.metrics.totalTenants, 2);
  assert.equal(s.metrics.failedInvites, 1);
  assert.equal(s.metrics.openTickets, 1);
  assert.equal(s.metrics.totalCollected, 1000);
  assert.equal(s.metrics.totalOutstanding, 500);
  assert.equal(s.metrics.totalAnnualRent, 60000);
  assert.equal(s.metrics.paymentsTruncated, false);
  assert.equal(s.health.firestore.status, 'operational');
  assert.equal(typeof s.health.firestore.latencyMs, 'number');
  assert.notEqual(s.health.smtp.status, 'operational', 'SMTP must not be reported healthy without a verified login');
  assert.ok(s.generatedAtIso);
});

test('refresh callable requires Admin with MFA and rate-limits to once a minute', async () => {
  await seed();
  await expectHttpsError(call(m.adminRefreshControlCenterSummary, owner, {}), 'permission-denied');
  await expectHttpsError(call(m.adminRefreshControlCenterSummary, adminNoMfa, {}), 'permission-denied');
  const ok = await call(m.adminRefreshControlCenterSummary, adminMfa, {});
  assert.equal(ok.ok, true);
  await expectHttpsError(call(m.adminRefreshControlCenterSummary, adminMfa, {}), 'resource-exhausted');
});

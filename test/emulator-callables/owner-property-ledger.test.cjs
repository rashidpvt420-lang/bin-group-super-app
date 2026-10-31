'use strict';
// Per-property owner ledger: verified records only, own-property only, read-only.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { getOwnerPropertyLedger } = lib('runtimeAll.js');
const OWNER = 'opl_owner';
const OTHER = 'opl_other';
let owner, other, tenant;
test.before(async () => {
  owner = await createUser(OWNER, { role: 'owner' });
  other = await createUser(OTHER, { role: 'owner' });
  tenant = await createUser('opl_tenant', { role: 'tenant' });
});
test.beforeEach(async () => {
  await clearFirestore();
  const s = (p, d) => db.doc(p).set(d);
  await s('properties/p_opl', { ownerId: OWNER, name: 'Tower A' });
  await s('properties/p_other', { ownerId: OTHER });
  await s('rent_installments/l_01', { propertyId: 'p_opl', ownerId: OWNER, dueDate: '2000-01-01', amount: 10000, status: 'PAID' });
  await s('rent_installments/l_02', { propertyId: 'p_opl', ownerId: OWNER, dueDate: '2000-02-01', amount: 10000, chequeNumber: '000777', status: 'OVERDUE' });
  await s('rent_installments/l_03', { propertyId: 'p_opl', ownerId: OWNER, dueDate: '2000-03-01', amount: 10000, status: 'PENDING_VERIFICATION' });
  await s('rent_installments/x_01', { propertyId: 'p_opl', ownerId: OTHER, dueDate: '2000-01-01', amount: 99999, status: 'PAID' });
  await s('invoices/i1', { propertyId: 'p_opl', ownerId: OWNER, amount: 500, amountPaid: 100, status: 'UNPAID' });
  await s('invoices/i2', { propertyId: 'p_opl', ownerId: OWNER, amount: 800, status: 'PAID' });
  await s('payment_transactions/m1', { propertyId: 'p_opl', ownerId: OWNER, paymentType: 'maintenance', amount: 1200, paymentVerified: true });
  await s('payment_transactions/m2', { propertyId: 'p_opl', ownerId: OWNER, paymentType: 'maintenance', amount: 5000, paymentVerified: false });
  await s('owner_approval_requests/a1', { propertyId: 'p_opl', ownerId: OWNER, decision: 'APPROVED', estimateBandAed: 2500 });
  await s('owner_approval_requests/a2', { propertyId: 'p_opl', ownerId: OWNER, decision: '', estimateBandAed: 9000 });
});

test('owner gets a joined ledger built from verified records only', async () => {
  const r = await call(getOwnerPropertyLedger, owner, { propertyId: 'p_opl' });
  assert.equal(r.rent.receivedVerified, 10000);
  assert.equal(r.rent.dueOpen, 20000);
  assert.equal(r.chequeMaturities.length, 1);
  assert.equal(r.chequeMaturities[0].chequeNumber, '000777');
  assert.equal(r.chequeMaturities[0].overdue, true);
  assert.equal(r.outstandingInvoices.total, 400);
  assert.equal(r.maintenanceSpendVerified, 1200);
  assert.deepEqual([r.approvedQuotes.count, r.approvedQuotes.estimateBandTotal, r.approvedQuotes.isEstimate], [1, 2500, true]);
  assert.equal(r.noiVerified, 8800);
  assert.equal(r.basis, 'verified_records_only');
});

test('another owner, a tenant or a guest cannot read the ledger', async () => {
  await expectHttpsError(call(getOwnerPropertyLedger, other, { propertyId: 'p_opl' }), 'permission-denied');
  await expectHttpsError(call(getOwnerPropertyLedger, tenant, { propertyId: 'p_opl' }), 'permission-denied');
  await expectHttpsError(call(getOwnerPropertyLedger, null, { propertyId: 'p_opl' }), 'unauthenticated');
});

test('ledger is read-only and rejects bad input', async () => {
  await expectHttpsError(call(getOwnerPropertyLedger, owner, { propertyId: '../x' }), 'invalid-argument');
  await expectHttpsError(call(getOwnerPropertyLedger, owner, { propertyId: 'p_missing' }), 'not-found');
  await call(getOwnerPropertyLedger, owner, { propertyId: 'p_opl' });
  assert.equal((await db.doc('owner_approval_requests/a2').get()).data().decision, '');
});

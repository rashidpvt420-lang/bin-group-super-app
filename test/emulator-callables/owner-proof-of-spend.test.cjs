'use strict';
// Proof of Spend: linked chain per expense, invoice-vs-quote, labour/materials, own-data only, partial flag.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { getOwnerProofOfSpend } = lib('runtimeAll.js');
const ps = lib('ownerProofOfSpend.js');
let owner, other, tenant;
test.before(async () => {
  owner = await createUser('ops_owner', { role: 'owner' });
  other = await createUser('ops_owner2', { role: 'owner' });
  tenant = await createUser('ops_tenant', { role: 'tenant' });
});
test.beforeEach(clearFirestore);

test('pure: invoice vs quote and split', () => {
  assert.deepEqual(ps.invoiceVsQuote(1100, 1000), { state: 'OVER_QUOTE', varianceAed: 100, variancePct: 10 });
  assert.equal(ps.invoiceVsQuote(900, 1000).state, 'WITHIN_QUOTE');
  assert.equal(ps.invoiceVsQuote(null, 1000).state, 'NOT_COMPARABLE');
  assert.equal(ps.labourMaterials({ totalAed: 1000, labourAed: 600 }).state, 'NOT_ITEMISED');
  assert.deepEqual(ps.labourMaterials({ totalAed: 1000, labourAed: 600, materialsAed: 350 }), { state: 'ITEMISED', labourAed: 600, materialsAed: 350, otherAed: 50 });
});

test('chain links come from stored records; other owners see nothing', async () => {
  await db.doc('owner_approval_requests/a1').set({ ownerId: 'ops_owner', rfqId: 'r1', ticketId: 't1', trade: 'HVAC', decision: 'approved', status: 'approved' });
  await db.doc('vendor_quotes/q1').set({ ownerId: 'ops_owner', rfqId: 'r1', amountAed: 1000 });
  await db.doc('vendor_quotes/q2').set({ ownerId: 'ops_owner', rfqId: 'r1', amountAed: 1200 });
  await db.doc('maintenanceTickets/t1').set({ ownerId: 'ops_owner', technicianAfterPhotos: ['a', 'b'] });
  await db.doc('invoices/i1').set({ ownerId: 'ops_owner', approvalRequestId: 'a1', totalAed: 1100, labourAed: 700, materialsAed: 400, paymentStatus: 'PAID' });
  await db.doc('owner_approval_requests/a2').set({ ownerId: 'ops_owner', trade: 'Paint', status: 'pending_owner_decision' });
  const res = await call(getOwnerProofOfSpend, owner, {});
  assert.equal(res.complete, true);
  const c1 = res.chains.find((c) => c.approvalRequestId === 'a1');
  assert.deepEqual(c1.links, { APPROVAL: 'PRESENT', QUOTES: 'PRESENT', WORK_EVIDENCE: 'PRESENT', INVOICE: 'PRESENT', PAYMENT: 'PRESENT' });
  assert.equal(c1.lowestQuoteAed, 1000);
  assert.equal(c1.check.state, 'OVER_QUOTE');
  assert.equal(c1.split.labourAed, 700);
  const c2 = res.chains.find((c) => c.approvalRequestId === 'a2');
  assert.ok(Object.values(c2.links).every((v) => v === 'MISSING'));
  assert.equal((await call(getOwnerProofOfSpend, other, {})).chains.length, 0);
  await expectHttpsError(call(getOwnerProofOfSpend, tenant, {}), 'permission-denied');
});

test('reports complete:false when more expenses exist than one page', async () => {
  for (let i = 0; i <= ps.PAGE_SIZE; i += 1) await db.doc(`owner_approval_requests/x${i}`).set({ ownerId: 'ops_owner', status: 'pending' });
  const res = await call(getOwnerProofOfSpend, owner, {});
  assert.equal(res.chains.length, ps.PAGE_SIZE);
  assert.equal(res.complete, false);
});

test('owner AI summary flags capped partial snapshots', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src/owner/pages/OwnerAIIntelligencePage.tsx'), 'utf8');
  assert.match(src, /tickets\.length >= 250 \|\| invoices\.length >= 100/);
  assert.match(src, /not your full ledger/);
  assert.match(src, /ليس سجلك الكامل/);
});

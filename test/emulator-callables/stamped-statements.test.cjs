'use strict';
// Official stamped statements: own-data only, totals, voids, registry hash verification, Arabic.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { generateMyMoneyStatement, verifyIssuedDocument } = lib('runtimeAll.js');

const OWNER = 'stmt_owner_a';
const OTHER = 'stmt_owner_b';
const TENANT = 'stmt_tenant_a';
let owner;
let other;
let tenant;

test.before(async () => {
  owner = await createUser(OWNER, { role: 'owner' }, { displayName: 'Owner Alpha' });
  other = await createUser(OTHER, { role: 'owner' }, { displayName: 'Owner Beta' });
  tenant = await createUser(TENANT, { role: 'tenant' });
});

test.beforeEach(async () => {
  await clearFirestore();
  // Owner A's own records in September 2026.
  await db.doc('invoices/inv_a1').set({ ownerId: OWNER, amount: 1500, status: 'issued', issuedAt: '2026-09-03', invoiceNumber: 'INV-A1' });
  await db.doc('payment_transactions/pt_a1').set({ ownerId: OWNER, tenantId: TENANT, payerId: TENANT, amount: 1500, status: 'paid', paidAt: '2026-09-05' });
  await db.doc('payment_collection_records/pc_a1').set({ payerUid: OWNER, amount: 300, method: 'cash', collectedOn: '2026-09-10', status: 'collected' });
  await db.doc('payment_collection_records/pc_a2').set({ payerUid: OWNER, amount: 999, method: 'cheque', chequeNumber: '000123', collectedOn: '2026-09-11', status: 'collected' });
  await db.doc('payment_collection_voids/pc_a2').set({ recordId: 'pc_a2', payerUid: OWNER, reason: 'bounced' });
  // Outside the period.
  await db.doc('payment_transactions/pt_a_old').set({ ownerId: OWNER, payerId: TENANT, amount: 777, status: 'paid', paidAt: '2026-07-01' });
  // Owner B's records (must never appear on A's statement).
  await db.doc('invoices/inv_b1').set({ ownerId: OTHER, amount: 424242, status: 'issued', issuedAt: '2026-09-04', invoiceNumber: 'SECRET-B1' });
  await db.doc('payment_collection_records/pc_b1').set({ payerUid: OTHER, amount: 313131, method: 'cash', collectedOn: '2026-09-12', status: 'collected' });
});

const csvFor = async (actor, extra = {}) => {
  const res = await call(generateMyMoneyStatement, actor, { from: '2026-09-01', to: '2026-09-30', format: 'csv', ...extra });
  return { res, text: Buffer.from(res.base64, 'base64').toString('utf8') };
};

test('requires sign-in', async () => {
  await expectHttpsError(call(generateMyMoneyStatement, null, { from: '2026-09-01', to: '2026-09-30' }), 'unauthenticated');
});

test('statement contains only the caller\'s own records, even if another uid is requested', async () => {
  const { text } = await csvFor(owner, { uid: OTHER, ownerId: OTHER, accountId: OTHER, email: 'stmt_owner_b@example.invalid' });
  assert.match(text, /INV-A1/);
  assert.doesNotMatch(text, /SECRET-B1|424242|313131/);
  assert.doesNotMatch(text, /777\.00/); // outside the period
  const b = await csvFor(other);
  assert.match(b.text, /SECRET-B1/);
  assert.doesNotMatch(b.text, /INV-A1/);
});

test('totals match the records and voided cash/cheque entries are shown as void and excluded', async () => {
  const { res, text } = await csvFor(owner);
  assert.equal(res.totals.moneyIn, 1500);
  assert.equal(res.totals.moneyOut, 300);
  assert.equal(res.totals.net, 1200);
  assert.equal(res.totals.invoiced, 1500);
  assert.equal(res.totals.voidedCount, 1);
  const voidLine = text.split('\r\n').find((l) => l.includes('000123'));
  assert.ok(voidLine && voidLine.includes(',void,'), `void row missing: ${voidLine}`);
});

test('statement paginates more than one Firestore page instead of truncating official totals', async () => {
  let batch = db.batch();
  for (let i = 0; i < 1005; i += 1) {
    const id = `inv_page_${String(i).padStart(4, '0')}`;
    batch.set(db.doc(`invoices/${id}`), {
      ownerId: OWNER,
      amount: 1,
      status: 'issued',
      issuedAt: '2026-09-20',
      invoiceNumber: `INV-PAGED-${i}`,
    });
    if ((i + 1) % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();

  const { res, text } = await csvFor(owner);
  assert.equal(res.totals.invoiced, 2505);
  assert.match(text, /INV-PAGED-1004/);
});

test('registry stores the exact file hash and the public check verifies it without personal data', async () => {
  const { res } = await csvFor(owner);
  const bytes = Buffer.from(res.base64, 'base64');
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(res.sha256, sha);
  const reg = (await db.doc(`issued_document_registry/${res.documentId}`).get()).data();
  assert.equal(reg.sha256, sha);
  assert.equal(reg.subjectUid, OWNER);
  const ok = await call(verifyIssuedDocument, null, { documentId: res.documentId, sha256: sha });
  assert.equal(ok.found, true);
  assert.equal(ok.hashMatches, true);
  assert.equal(JSON.stringify(ok).includes(OWNER), false);
  assert.equal(JSON.stringify(ok).includes('Owner Alpha'), false);
  const tampered = crypto.createHash('sha256').update(Buffer.concat([bytes, Buffer.from('x')])).digest('hex');
  const bad = await call(verifyIssuedDocument, null, { documentId: res.documentId, sha256: tampered });
  assert.equal(bad.hashMatches, false);
  const missing = await call(verifyIssuedDocument, null, { documentId: `stmt_${'0'.repeat(32)}` });
  assert.equal(missing.found, false);
  await expectHttpsError(call(verifyIssuedDocument, null, { documentId: '../users/x' }), 'invalid-argument');
});

test('Arabic PDF statement renders with the Cairo font and is registered', async () => {
  const res = await call(generateMyMoneyStatement, tenant, { from: '2026-09-01', to: '2026-09-30', format: 'pdf', language: 'ar' });
  const pdf = Buffer.from(res.base64, 'base64');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.match(pdf.toString('latin1'), /Cairo/);
  assert.equal(res.totals.moneyOut, 1500); // tenant paid the owner's invoice
  const reg = (await db.doc(`issued_document_registry/${res.documentId}`).get()).data();
  assert.equal(reg.sha256, crypto.createHash('sha256').update(pdf).digest('hex'));
  assert.equal(reg.subjectUid, TENANT);
});

test('rejects bad periods and enforces the daily quota', async () => {
  await expectHttpsError(call(generateMyMoneyStatement, owner, { from: '2026-09-30', to: '2026-09-01' }), 'invalid-argument');
  await expectHttpsError(call(generateMyMoneyStatement, owner, { from: '2024-01-01', to: '2026-09-01' }), 'invalid-argument');
  await db.doc(`money_statement_rate_limits/${OWNER}`).set({ day: new Date().toISOString().slice(0, 10), count: 20 });
  await expectHttpsError(call(generateMyMoneyStatement, owner, { from: '2026-09-01', to: '2026-09-30' }), 'resource-exhausted');
});

test('suspended accounts cannot pull statements', async () => {
  const suspended = { uid: OWNER, token: { ...owner.token, suspended: true } };
  await expectHttpsError(call(generateMyMoneyStatement, suspended, { from: '2026-09-01', to: '2026-09-30' }), 'permission-denied');
});

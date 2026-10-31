'use strict';
// Painting chain: owner request -> MFA admin quote (margin floor) -> owner OTP approval -> work order.
// Duplicate requests with the same requestId must create one project. Emulator only.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

process.env.OWNER_CONTRACT_OTP_PEPPER = process.env.OWNER_CONTRACT_OTP_PEPPER || 'p'.repeat(48);
const m = lib('paintingProjects.js');
const MFA = { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };
let owner; let other; let adminMfa;
test.before(async () => {
  owner = await createUser('owner_chain', { role: 'owner' });
  other = await createUser('owner_chain_other', { role: 'owner' });
  adminMfa = await createUser('admin_chain', { role: 'admin', admin: true }, MFA);
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('properties/test-prop').set({ ownerId: owner.uid, isTestData: true });
});

const REQ = { propertyId: 'test-prop', scope: 'ROOM', requestId: 'req-0001-abcdef' };
const QUOTE = {
  surveyMeasurements: { wallAreaSqm: 40, ceilingAreaSqm: 12, condition: 'GOOD', paintGrade: 'STANDARD', coats: 2 },
  costSheet: { materialsAed: 900, labourAed: 1500 },
  priceAed: 5000, permits: {},
};

test('full chain request -> quote -> OTP approval -> work order', async () => {
  const { projectId } = await call(m.ownerRequestPaintingProject, owner, REQ);
  await expectHttpsError(call(m.ownerRequestPaintingProject, other, { ...REQ, requestId: 'req-other-0001' }), 'permission-denied');
  const quote = await call(m.adminIssuePaintingQuote, adminMfa, { projectId, ...QUOTE }).catch((e) => { throw new Error(`quote: ${e.message}`); });
  assert.equal(quote.quoteVersion, 1);
  await expectHttpsError(call(m.adminIssuePaintingQuote, adminMfa, { projectId, ...QUOTE, priceAed: 2700 }), 'failed-precondition');
  // Email delivery is unavailable in the emulator: seed the OTP exactly as ownerRequestPaintingApprovalOtp stores it.
  const salt = 'ab'.repeat(16);
  const digest = m.paintingOtpDigest({ otpId: 'otp1', uid: owner.uid, projectId, quoteVersion: 1, otp: '123456', salt, pepper: process.env.OWNER_CONTRACT_OTP_PEPPER });
  await db.doc('system_secrets/painting_approval_otps/otps/otp1').set({ uid: owner.uid, projectId, quoteVersion: 1, salt, digest, attempts: 0, status: 'PENDING', requestedAt: admin.firestore.Timestamp.now(), expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 600000) });
  await expectHttpsError(call(m.adminOpenPaintingWorkOrder, adminMfa, { projectId }), 'failed-precondition');
  const ok = await call(m.ownerApprovePaintingQuote, owner, { projectId, otpId: 'otp1', quoteVersion: 1, otp: '123456' });
  assert.equal(ok.status, 'OWNER_APPROVED');
  await expectHttpsError(call(m.adminOpenPaintingWorkOrder, adminMfa, { projectId }), 'failed-precondition'); // no before photos
  await admin.storage().bucket().file(`painting-projects/${projectId}/before/a.jpg`).save(Buffer.from('jpg'), { contentType: 'image/jpeg' });
  await call(m.adminRecordPaintingPhotos, adminMfa, { projectId, kind: 'BEFORE', paths: [`painting-projects/${projectId}/before/a.jpg`] });
  assert.equal((await call(m.adminOpenPaintingWorkOrder, adminMfa, { projectId })).status, 'WORK_ORDER_OPEN');
  const p = (await db.doc(`painting_projects/${projectId}`).get()).data();
  assert.equal(p.approvedQuoteVersion, 1);
  assert.equal(p.status, 'WORK_ORDER_OPEN'); assert.equal(p.workOrder.quoteVersion, 1);
  assert.equal(p.billing, 'ONE_TIME');
});

test('duplicate painting requests with the same requestId create exactly one project', async () => {
  const a = await call(m.ownerRequestPaintingProject, owner, REQ);
  const b = await call(m.ownerRequestPaintingProject, owner, REQ);
  const [c, d] = await Promise.all([call(m.ownerRequestPaintingProject, owner, REQ), call(m.ownerRequestPaintingProject, owner, REQ)]);
  assert.equal(new Set([a.projectId, b.projectId, c.projectId, d.projectId]).size, 1);
  assert.equal((await db.collection('painting_projects').where('ownerId', '==', owner.uid).get()).size, 1);
});

test('requestId is validated and owner-scoped', async () => {
  await expectHttpsError(call(m.ownerRequestPaintingProject, owner, { ...REQ, requestId: '../x' }), 'invalid-argument');
  await db.doc('properties/other-prop').set({ ownerId: other.uid });
  const mine = await call(m.ownerRequestPaintingProject, owner, REQ);
  const theirs = await call(m.ownerRequestPaintingProject, other, { ...REQ, propertyId: 'other-prop' });
  assert.notEqual(mine.projectId, theirs.projectId);
});

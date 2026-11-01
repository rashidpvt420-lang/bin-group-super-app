'use strict';
// Painting step 3: itemised quote (margin floor, owner never sees cost), survey areas, contractor,
// cost tracking, staged cash/cheque billing with Finance (MFA) approval, idempotency, AI guard.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

process.env.OWNER_CONTRACT_OTP_PEPPER = process.env.OWNER_CONTRACT_OTP_PEPPER || 'p'.repeat(48);
const m = lib('paintingProjects.js');
const MFA = { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };
let owner, other, adminMfa, finance, financeNoMfa, aiAdmin, financeController, legacyFinanceAdmin, issuerFinance;
test.before(async () => {
  owner = await createUser('owner_bill', { role: 'owner' });
  other = await createUser('owner_bill_other', { role: 'owner' });
  adminMfa = await createUser('admin_bill', { role: 'admin', admin: true }, MFA);
  finance = await createUser('finance_bill', { role: 'finance_manager' }, MFA);
  financeNoMfa = await createUser('finance_bill_nomfa', { role: 'finance_manager' });
  financeController = await createUser('finance_ctrl_bill', { role: 'finance_controller' }, MFA);
  legacyFinanceAdmin = await createUser('finance_admin_bill', { role: 'finance_admin' }, MFA);
  // A finance_manager who also holds an Admin claim: may issue invoices, never approve their own.
  issuerFinance = await createUser('issuer_fin_bill', { role: 'finance_manager', admin: true }, MFA);
  aiAdmin = await createUser('ai_bill', { role: 'admin', admin: true, ai: true }, MFA);
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('properties/bprop').set({ ownerId: owner.uid, propertyType: 'building' });
});
const bucket = () => admin.storage().bucket();
const LINES = [
  { category: 'LABOUR', description: 'Painters 6 x 4 days', qty: 24, unit: 'day', unitCostAed: 250, currency: 'AED' },
  { category: 'MATERIALS', description: 'Emulsion + primer', qty: 1, unit: 'lot', unitCostAed: 4000, currency: 'AED' },
  { category: 'PREP', description: 'Crack filling and sanding', qty: 1, unit: 'lot', unitCostAed: 1000, currency: 'AED' },
  { category: 'ACCESS', description: 'Scaffold hire', qty: 1, unit: 'lot', unitCostAed: 2000, currency: 'AED' },
  { category: 'PERMIT', description: 'Community NOC', qty: 1, unit: 'each', unitCostAed: 1000, currency: 'AED' },
];
const SURVEY = [{ kind: 'COMMON_AREA', label: 'Lobby', floor: 'G', wallAreaSqm: 130, ceilingAreaSqm: 40, condition: 'FAIR' }, { kind: 'EXTERIOR', label: 'Facade', wallAreaSqm: 820, surfaces: ['FACADE'], condition: 'POOR' }];
// direct cost 14,000. Reserves (10% = 1,400 contingency, 3% = 420 warranty) are held separately, not cost.
// Gross margin = (price - 14,000) / price. Hard floor 20% -> AED 17,500. Target 35% -> AED 21,538.46.

async function approvedProject() {
  const photo = `painting-owner-uploads/${owner.uid}/lobby.jpg`;
  await bucket().file(photo).save(Buffer.from('jpg'), { contentType: 'image/jpeg' });
  const { projectId } = await call(m.ownerRequestPaintingProject, owner, {
    propertyId: 'bprop', scope: 'FULL_BUILDING', requestId: 'req-bill-0001',
    areas: [
      { kind: 'COMMON_AREA', label: 'Lobby', wallAreaSqm: 120, ceilingAreaSqm: 40, surfaces: ['WALLS', 'CEILING'], colour: 'White', condition: 'FAIR', photoPaths: [photo] },
      { kind: 'EXTERIOR', label: 'Facade', wallAreaSqm: 800, surfaces: ['FACADE'], colour: 'Sand', condition: 'POOR' },
    ],
  });
  const q = await call(m.adminIssuePaintingQuote, adminMfa, { projectId, requestId: 'quote-bill-0001', surveyAreas: SURVEY, lines: LINES, priceAed: 25000, permits: { communityNocRequired: true } });
  const salt = 'ab'.repeat(16);
  const digest = m.paintingOtpDigest({ otpId: 'otpb', uid: owner.uid, projectId, quoteVersion: 1, otp: '123456', salt, pepper: process.env.OWNER_CONTRACT_OTP_PEPPER });
  await db.doc('system_secrets/painting_approval_otps/otps/otpb').set({ uid: owner.uid, projectId, quoteVersion: 1, salt, digest, attempts: 0, status: 'PENDING', requestedAt: admin.firestore.Timestamp.now(), expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 600000) });
  await call(m.ownerApprovePaintingQuote, owner, { projectId, otpId: 'otpb', quoteVersion: 1, otp: '123456' });
  return { projectId, q };
}

test('full-building request stores areas; owner photo outside own folder is refused', async () => {
  await expectHttpsError(call(m.ownerRequestPaintingProject, owner, { propertyId: 'bprop', scope: 'FULL_BUILDING', requestId: 'req-bad-0001', areas: [{ kind: 'ROOM', label: 'x', wallAreaSqm: 10, photoPaths: [`painting-owner-uploads/${other.uid}/a.jpg`] }] }), 'failed-precondition');
  const { projectId } = await approvedProject();
  const p = (await db.doc(`painting_projects/${projectId}`).get()).data();
  assert.equal(p.scope, 'FULL_BUILDING');
  assert.equal(p.ownerAreas.length, 2);
  assert.equal(p.ownerAreaSummary.wallAreaSqm, 920);
  assert.equal(p.permits.communityNocRequired, true);
});

test('itemised quote enforces the margin floor; owner copy hides cost and margin', async () => {
  await expectHttpsError((async () => {
    await call(m.ownerRequestPaintingProject, owner, { propertyId: 'bprop', scope: 'ROOM', requestId: 'req-low-0001' });
    const pid = `${owner.uid}_req-low-0001`;
    return call(m.adminIssuePaintingQuote, adminMfa, { projectId: pid, surveyAreas: SURVEY, lines: LINES, priceAed: 21000, permits: {} });
  })(), 'failed-precondition'); // 33.3%: below the 35% target with no written reason
  {
    const pid = `${owner.uid}_req-low-0001`;
    const reason = 'Repeat client, phased works';
    // Below the hard 20% floor: blocked even with a reason and a request-side minMarginPct (no override).
    await expectHttpsError(call(m.adminIssuePaintingQuote, adminMfa, { projectId: pid, surveyAreas: SURVEY, lines: LINES, priceAed: 17400, minMarginPct: 0, belowTargetReason: reason, permits: {} }), 'failed-precondition');
    // Lines must be AED, and the required categories must be present.
    await expectHttpsError(call(m.adminIssuePaintingQuote, adminMfa, { projectId: pid, surveyAreas: SURVEY, lines: LINES.map((l) => ({ ...l, currency: 'USD' })), priceAed: 30000, permits: {} }), 'failed-precondition');
    await expectHttpsError(call(m.adminIssuePaintingQuote, adminMfa, { projectId: pid, surveyAreas: SURVEY, lines: LINES.filter((l) => l.category !== 'PREP'), priceAed: 30000, permits: {} }), 'failed-precondition');
    await expectHttpsError(call(m.adminIssuePaintingQuote, adminMfa, { projectId: pid, surveyAreas: SURVEY, lines: [{ ...LINES[0], unitCostAed: -1 }, ...LINES.slice(1)], priceAed: 30000, permits: {} }), 'failed-precondition');
    await expectHttpsError(call(m.adminIssuePaintingQuote, adminMfa, { projectId: pid, surveyAreas: SURVEY, costSheet: { materialsAed: 4000, labourAed: 6000, prepAed: 1000 }, priceAed: 30000, permits: {} }), 'invalid-argument'); // no lines
    // 20%-35% with a written reason is allowed and flagged.
    const ok = await call(m.adminIssuePaintingQuote, adminMfa, { projectId: pid, surveyAreas: SURVEY, lines: LINES, priceAed: 17500, belowTargetReason: reason, permits: {} });
    assert.equal(ok.grossMarginPct, 20); assert.equal(ok.belowTarget, true); assert.equal(ok.belowTargetReason, reason);
    const a = await db.collection('audit_logs').where('projectId', '==', pid).where('action', '==', 'PAINTING_QUOTE_ISSUED').get();
    assert.equal(a.docs[0].get('belowTarget'), true);
  }
  // config cannot lower the floor below the hard 20%
  await db.doc('platform_config/painting').set({ minGrossMarginPct: 5 });
  const pid = `${owner.uid}_req-low-0001`;
  await expectHttpsError(call(m.adminIssuePaintingQuote, adminMfa, { projectId: pid, surveyAreas: SURVEY, lines: LINES, priceAed: 17000, belowTargetReason: 'Repeat client, phased works', permits: {} }), 'failed-precondition');
  await db.doc('platform_config/painting').delete();

  const { projectId, q } = await approvedProject();
  assert.equal(q.directCostAed, 14000);
  assert.equal(q.contingencyReserveAed, 1400); assert.equal(q.warrantyReserveAed, 420);
  assert.equal(q.totalCostAed, undefined); // reserves are never added to cost
  assert.equal(q.grossMarginPct, 44); // (25000 - 14000) / 25000
  assert.equal(q.marginAfterReservesAed, 25000 - 14000 - 1400 - 420);
  assert.equal(q.minMarginPct, 20); assert.equal(q.targetMarginPct, 35); assert.equal(q.belowTarget, false);
  await expectHttpsError(call(m.adminIssuePaintingQuote, adminMfa, { projectId, lines: LINES, priceAed: 30000 }), 'invalid-argument'); // no survey
  const owned = (await db.doc(`painting_projects/${projectId}/quotes/v1`).get()).data();
  assert.equal(owned.costSheet, undefined); assert.equal(owned.grossMarginPct, undefined); assert.equal(owned.totalCostAed, undefined);
  assert.equal(Math.round(owned.lines.reduce((s, l) => s + l.amountAed, 0) * 100) / 100, 25000);
  assert.deepEqual(owned.paymentMethods, ['CASH', 'CHEQUE']);
  const internal = (await db.doc(`painting_projects/${projectId}/internal_quotes/v1`).get()).data();
  assert.equal(internal.directCostAed, 14000); assert.equal(internal.costLines.length, 5);
  assert.ok(internal.costLines.every((l) => l.currency === 'AED'));
  // Separate reserve ledger records, written on owner acceptance of the quote.
  const ledger = await db.collection(`painting_projects/${projectId}/reserve_ledger`).get();
  assert.deepEqual(ledger.docs.map((d) => [d.get('reserve'), d.get('entry'), d.get('amountAed')]).sort(), [['CONTINGENCY', 'HOLD', 1400], ['WARRANTY', 'HOLD', 420]]);
  const proj = (await db.doc(`painting_projects/${projectId}`).get()).data();
  assert.equal(proj.reserves.contingencyHeldAed, 1400); assert.equal(proj.reserves.warrantyHeldAed, 420); assert.equal(proj.quotedDirectCostAed, 14000);
  // replaying the same quote requestId does not create v2
  const replay = await call(m.adminIssuePaintingQuote, adminMfa, { projectId, requestId: 'quote-bill-0001', surveyAreas: SURVEY, lines: LINES, priceAed: 25000, permits: { communityNocRequired: true } });
  assert.equal(replay.idempotent, true);
  assert.equal((await db.doc(`painting_projects/${projectId}`).get()).get('quoteVersion'), 1);
  const p = (await db.doc(`painting_projects/${projectId}`).get()).data();
  assert.deepEqual(p.billingSchedule, { DEPOSIT: 10000, PROGRESS: 7500, FINAL: 7500 });
});

test('staged billing: deposit gates work order, cash/cheque only, Finance MFA decides, final gates warranty', async () => {
  const { projectId } = await approvedProject();
  const C = { projectId, requestId: 'contr-0001', name: 'Al Noor Painting LLC', agreedCostAed: 12000 };
  await expectHttpsError(call(m.adminAssignPaintingContractor, aiAdmin, C), 'permission-denied');
  await expectHttpsError(call(m.adminAssignPaintingContractor, owner, C), 'permission-denied');
  await call(m.adminAssignPaintingContractor, adminMfa, C);
  assert.equal((await call(m.adminAssignPaintingContractor, adminMfa, C)).idempotent, true);

  await expectHttpsError(call(m.adminIssuePaintingInvoice, adminMfa, { projectId, requestId: 'inv-prog-0001', stage: 'PROGRESS' }), 'failed-precondition');
  const dep = await call(m.adminIssuePaintingInvoice, adminMfa, { projectId, requestId: 'inv-dep-0001', stage: 'DEPOSIT' });
  assert.equal(dep.amountAed, 10000);
  assert.equal((await call(m.adminIssuePaintingInvoice, adminMfa, { projectId, requestId: 'inv-dep-0001', stage: 'DEPOSIT' })).idempotent, true);
  await expectHttpsError(call(m.adminIssuePaintingInvoice, adminMfa, { projectId, requestId: 'inv-dep-0002', stage: 'DEPOSIT' }), 'already-exists');

  const proof = `painting-owner-uploads/${owner.uid}/cheque.jpg`;
  await bucket().file(proof).save(Buffer.from('jpg'), { contentType: 'image/jpeg' });
  const P = { projectId, requestId: 'proof-0001', stage: 'DEPOSIT', method: 'CHEQUE', chequeNo: '000123', bank: 'Emirates NBD', chequeDate: '2026-11-01', proofPath: proof };
  await expectHttpsError(call(m.ownerSubmitPaintingPaymentProof, owner, { ...P, method: 'CARD' }), 'failed-precondition'); // card is off
  await expectHttpsError(call(m.ownerSubmitPaintingPaymentProof, owner, { ...P, chequeNo: '' }), 'invalid-argument');
  await expectHttpsError(call(m.ownerSubmitPaintingPaymentProof, other, P), 'invalid-argument'); // not their folder
  await expectHttpsError(call(m.ownerSubmitPaintingPaymentProof, owner, { ...P, proofPath: `painting-owner-uploads/${owner.uid}/missing.jpg` }), 'failed-precondition');
  await call(m.ownerSubmitPaintingPaymentProof, owner, P);
  assert.equal((await call(m.ownerSubmitPaintingPaymentProof, owner, P)).idempotent, true);

  const F = { projectId, requestId: 'fin-0001', stage: 'DEPOSIT', decision: 'REJECT', note: 'Cheque date unreadable' };
  await expectHttpsError(call(m.financeDecidePaintingPayment, financeNoMfa, F), 'permission-denied');
  await expectHttpsError(call(m.financeDecidePaintingPayment, owner, F), 'permission-denied');
  await expectHttpsError(call(m.financeDecidePaintingPayment, adminMfa, { ...F, decision: 'APPROVE' }), 'permission-denied'); // admin is not a finance approver
  await expectHttpsError(call(m.financeDecidePaintingPayment, legacyFinanceAdmin, { ...F, decision: 'APPROVE' }), 'permission-denied'); // finance_admin is not enough
  await call(m.financeDecidePaintingPayment, finance, F);
  assert.equal((await db.doc(`painting_projects/${projectId}/invoices/DEPOSIT`).get()).get('status'), 'REJECTED');
  await call(m.ownerSubmitPaintingPaymentProof, owner, { ...P, requestId: 'proof-0002' });
  await call(m.financeDecidePaintingPayment, finance, { projectId, requestId: 'fin-0002', stage: 'DEPOSIT', decision: 'APPROVE' });
  assert.equal((await call(m.financeDecidePaintingPayment, finance, { projectId, requestId: 'fin-0002', stage: 'DEPOSIT', decision: 'APPROVE' })).idempotent, true);

  const before = `painting-projects/${projectId}/before/a.jpg`; const after = `painting-projects/${projectId}/after/b.jpg`;
  await bucket().file(before).save(Buffer.from('jpg'), { contentType: 'image/jpeg' });
  await bucket().file(after).save(Buffer.from('jpg'), { contentType: 'image/jpeg' });
  await call(m.adminRecordPaintingPhotos, adminMfa, { projectId, kind: 'BEFORE', paths: [before] });
  assert.equal((await call(m.adminOpenPaintingWorkOrder, adminMfa, { projectId })).status, 'WORK_ORDER_OPEN');

  const cost = await call(m.adminRecordPaintingCost, adminMfa, { projectId, requestId: 'cost-0001', category: 'CONTRACTOR', amountAed: 12000, description: 'Contractor stage 1' });
  assert.equal(cost.actualMarginPct, 52);
  assert.equal(cost.quotedCostAed, 14000); assert.equal(cost.reserves.contingencyUsedAed, 0);
  assert.equal((await call(m.adminRecordPaintingCost, adminMfa, { projectId, requestId: 'cost-0001', category: 'CONTRACTOR', amountAed: 12000, description: 'Contractor stage 1' })).idempotent, true);
  assert.equal((await db.doc(`painting_projects/${projectId}`).get()).get('costs.actualCostAed'), 12000);
  // Overrun of 1,000 over the quoted direct cost draws contingency; margin uses actual cost only.
  const cost2 = await call(m.adminRecordPaintingCost, adminMfa, { projectId, requestId: 'cost-0002', category: 'MATERIALS', amountAed: 3000, description: 'Extra primer' });
  assert.equal(cost2.actualCostAed, 15000); assert.equal(cost2.actualMarginPct, 40);
  assert.deepEqual(cost2.reserves, { contingencyHeldAed: 1400, contingencyUsedAed: 1000, contingencyRemainingAed: 400, overrunBeyondContingencyAed: 0, warrantyHeldAed: 420 });
  assert.equal((await db.doc(`painting_projects/${projectId}/reserve_ledger/draw_cost-0002`).get()).get('amountAed'), 1000);

  // PROGRESS needs a documented milestone with photos.
  await expectHttpsError(call(m.adminIssuePaintingInvoice, issuerFinance, { projectId, requestId: 'inv-prog-0002', stage: 'PROGRESS' }), 'failed-precondition');
  const prog = `painting-projects/${projectId}/progress/p1.jpg`;
  await bucket().file(prog).save(Buffer.from('jpg'), { contentType: 'image/jpeg' });
  await expectHttpsError(call(m.adminRecordPaintingProgressMilestone, adminMfa, { projectId, percentComplete: 50, note: 'Half the floors done', photoPaths: [`painting-projects/${projectId}/after/b.jpg`] }), 'invalid-argument');
  await expectHttpsError(call(m.adminRecordPaintingProgressMilestone, owner, { projectId, percentComplete: 50, note: 'Half the floors done', photoPaths: [prog] }), 'permission-denied');
  await call(m.adminRecordPaintingProgressMilestone, adminMfa, { projectId, percentComplete: 50, note: 'Half the floors done', photoPaths: [prog] });
  const pinv = await call(m.adminIssuePaintingInvoice, issuerFinance, { projectId, requestId: 'inv-prog-0003', stage: 'PROGRESS' });
  assert.equal(pinv.amountAed, 7500);
  await call(m.ownerSubmitPaintingPaymentProof, owner, { ...P, requestId: 'proof-prog-01', stage: 'PROGRESS' });
  // The issuer cannot approve, even holding finance_manager with MFA.
  await expectHttpsError(call(m.financeDecidePaintingPayment, issuerFinance, { projectId, requestId: 'fin-prog-001', stage: 'PROGRESS', decision: 'APPROVE' }), 'permission-denied');
  await call(m.financeDecidePaintingPayment, financeController, { projectId, requestId: 'fin-prog-002', stage: 'PROGRESS', decision: 'APPROVE' });

  await expectHttpsError(call(m.adminIssuePaintingInvoice, adminMfa, { projectId, requestId: 'inv-fin-0001', stage: 'FINAL' }), 'failed-precondition'); // not completed
  await call(m.adminRecordPaintingPhotos, adminMfa, { projectId, kind: 'AFTER', paths: [after] });
  await call(m.adminCompletePaintingProject, adminMfa, { projectId });
  // FINAL needs the owner's acceptance of the documented completion.
  await expectHttpsError(call(m.adminIssuePaintingInvoice, adminMfa, { projectId, requestId: 'inv-fin-0002', stage: 'FINAL' }), 'failed-precondition');
  // Owner rejects the completed work: written reason, optional own photos, idempotent, audited.
  const snag = `painting-owner-uploads/${owner.uid}/${projectId}/rework-snag1.jpg`;
  await bucket().file(snag).save(Buffer.from('jpg'), { contentType: 'image/jpeg' });
  const foreign = `painting-owner-uploads/${other.uid}/${projectId}/x.jpg`;
  await expectHttpsError(call(m.ownerRejectPaintingCompletion, owner, { projectId, requestId: 'rej-0001', reason: 'bad' }), 'invalid-argument');
  await expectHttpsError(call(m.ownerRejectPaintingCompletion, owner, { projectId, requestId: 'rej-0001', reason: 'Patchy finish in lobby', photoPaths: [foreign] }), 'invalid-argument');
  await expectHttpsError(call(m.ownerRejectPaintingCompletion, other, { projectId, requestId: 'rej-0001', reason: 'Patchy finish in lobby' }), 'permission-denied');
  await expectHttpsError(call(m.ownerRejectPaintingCompletion, aiAdmin, { projectId, requestId: 'rej-0001', reason: 'Patchy finish in lobby' }), 'permission-denied');
  const rej = await call(m.ownerRejectPaintingCompletion, owner, { projectId, requestId: 'rej-0001', reason: 'Patchy finish in lobby', photoPaths: [snag] });
  assert.equal(rej.status, 'REWORK_REQUIRED'); assert.equal(rej.round, 1);
  assert.equal((await call(m.ownerRejectPaintingCompletion, owner, { projectId, requestId: 'rej-0001', reason: 'Patchy finish in lobby', photoPaths: [snag] })).idempotent, true);
  let pr = (await db.doc(`painting_projects/${projectId}`).get()).data();
  assert.equal(pr.status, 'REWORK_REQUIRED'); assert.equal(pr.reworkRound, 1);
  assert.deepEqual(pr.completionRejection.photoPaths, [snag]); assert.equal(pr.completionRejection.reason, 'Patchy finish in lobby');
  // A second, different rejection while rework is pending is refused (no double rounds).
  await expectHttpsError(call(m.ownerRejectPaintingCompletion, owner, { projectId, requestId: 'rej-0002', reason: 'Another complaint here' }), 'failed-precondition');
  // FINAL and acceptance are blocked during rework.
  await expectHttpsError(call(m.adminIssuePaintingInvoice, adminMfa, { projectId, requestId: 'inv-fin-rw01', stage: 'FINAL' }), 'failed-precondition');
  await expectHttpsError(call(m.ownerAcceptPaintingCompletion, owner, { projectId }), 'failed-precondition');
  // Admin records the rework milestone (photos under painting-projects/{id}/rework/).
  const rw = `painting-projects/${projectId}/rework/r1.jpg`;
  await bucket().file(rw).save(Buffer.from('jpg'), { contentType: 'image/jpeg' });
  await expectHttpsError(call(m.adminRecordPaintingReworkMilestone, owner, { projectId, note: 'Lobby repainted fully', photoPaths: [rw] }), 'permission-denied');
  await expectHttpsError(call(m.adminRecordPaintingReworkMilestone, adminMfa, { projectId, note: 'Lobby repainted fully', photoPaths: [prog] }), 'invalid-argument');
  await expectHttpsError(call(m.adminRecordPaintingReworkMilestone, adminMfa, { projectId, note: 'short', photoPaths: [rw] }), 'invalid-argument');
  const rwr = await call(m.adminRecordPaintingReworkMilestone, adminMfa, { projectId, note: 'Lobby repainted fully', photoPaths: [rw] });
  assert.equal(rwr.status, 'COMPLETED'); assert.equal(rwr.round, 1);
  assert.equal((await call(m.adminRecordPaintingReworkMilestone, adminMfa, { projectId, note: 'Lobby repainted fully', photoPaths: [rw] })).idempotent, true);
  pr = (await db.doc(`painting_projects/${projectId}`).get()).data();
  assert.equal(pr.completionReviews.R1.rework.recordedBy, adminMfa.uid);
  const rwAudit = await db.collection('audit_logs').where('projectId', '==', projectId).get();
  assert.ok(rwAudit.docs.some((d) => d.get('action') === 'PAINTING_COMPLETION_REJECTED' && d.get('actorUid') === owner.uid));
  assert.ok(rwAudit.docs.some((d) => d.get('action') === 'PAINTING_REWORK_MILESTONE_RECORDED'));
  assert.equal(rwAudit.docs.filter((d) => d.get('action') === 'PAINTING_COMPLETION_REJECTED').length, 1);

  // Finance review queue: invoices, proofs and minimum context only - never cost, margin, reserves or contractor.
  for (const denied of [owner, adminMfa, legacyFinanceAdmin, financeNoMfa]) {
    await expectHttpsError(call(m.financeListPaintingInvoices, denied, {}), 'permission-denied');
  }
  const queue = await call(m.financeListPaintingInvoices, financeController, {});
  const qp = queue.projects.find((x) => x.projectId === projectId);
  assert.ok(qp); assert.equal(qp.status, 'COMPLETED'); assert.equal(qp.progressMilestone.photoCount, 1);
  assert.ok(qp.invoices.some((i) => i.stage === 'PROGRESS' && i.status === 'PAID'));
  const flat = JSON.stringify(queue);
  for (const k of ['costs', 'actualCostAed', 'quotedDirectCostAed', 'grossMarginPct', 'marginPct', 'reserves', 'contingency', 'contractor', 'lines', 'unitCostAed']) assert.ok(!flat.includes(k), `queue leaks ${k}`);

  await expectHttpsError(call(m.ownerAcceptPaintingCompletion, other, { projectId }), 'permission-denied');
  await call(m.ownerAcceptPaintingCompletion, owner, { projectId, note: 'All good' });
  // Once accepted, the owner can no longer reject.
  await expectHttpsError(call(m.ownerRejectPaintingCompletion, owner, { projectId, requestId: 'rej-0003', reason: 'Changed my mind now' }), 'failed-precondition');
  assert.equal((await call(m.ownerAcceptPaintingCompletion, owner, { projectId })).idempotent, true);
  const acceptedAt = (await db.doc(`painting_projects/${projectId}`).get()).get('completionAcceptance.acceptedAt');
  const fin = await call(m.adminIssuePaintingInvoice, adminMfa, { projectId, requestId: 'inv-fin-0003', stage: 'FINAL' });
  assert.equal(fin.amountAed, 7500); // 40 / 30 / 30
  await expectHttpsError(call(m.adminIssuePaintingWarranty, adminMfa, { projectId, months: 12 }), 'failed-precondition');
  await expectHttpsError(call(m.adminIssuePaintingWarranty, adminMfa, { projectId, months: 24 }), 'invalid-argument');
  const cash = `painting-owner-uploads/${owner.uid}/cash.jpg`;
  await bucket().file(cash).save(Buffer.from('jpg'), { contentType: 'image/jpeg' });
  await call(m.ownerSubmitPaintingPaymentProof, owner, { projectId, requestId: 'proof-fin-01', stage: 'FINAL', method: 'CASH', proofPath: cash });
  await call(m.financeDecidePaintingPayment, finance, { projectId, requestId: 'fin-fin-001', stage: 'FINAL', decision: 'APPROVE' });
  const w = await call(m.adminIssuePaintingWarranty, adminMfa, { projectId });
  assert.equal(w.status, 'WARRANTY_ACTIVE'); assert.equal(w.months, 12);
  // Starts at the documented completion-and-acceptance timestamp; ends 12 months later.
  assert.equal(w.warrantyStartsAt, acceptedAt.toDate().toISOString());
  const end = acceptedAt.toDate(); end.setUTCMonth(end.getUTCMonth() + 12);
  assert.equal(w.warrantyEndsAt, end.toISOString());
  const audit = await db.collection('audit_logs').where('projectId', '==', projectId).get();
  assert.ok(audit.docs.some((d) => d.get('action') === 'PAINTING_PAYMENT_PAID'));
  assert.ok(audit.docs.some((d) => d.get('action') === 'PAINTING_PAYMENT_REJECTED'));
});

test('AI identities can never approve, quote or decide', async () => {
  const aiOwner = await createUser('ai_owner_bill', { role: 'owner', ai: true });
  await db.doc('painting_projects/x1').set({ ownerId: aiOwner.uid, status: 'QUOTED', quoteVersion: 1 });
  await expectHttpsError(call(m.ownerApprovePaintingQuote, aiOwner, { projectId: 'x1', otpId: 'o1', quoteVersion: 1, otp: '123456' }), 'permission-denied');
  await expectHttpsError(call(m.adminIssuePaintingQuote, aiAdmin, { projectId: 'x1', surveyAreas: SURVEY, lines: LINES, priceAed: 30000 }), 'permission-denied');
  const aiFinance = await createUser('ai_fin_bill', { role: 'finance_manager', isAi: true }, MFA);
  await expectHttpsError(call(m.financeDecidePaintingPayment, aiFinance, { projectId: 'x1', requestId: 'fin-ai-0001', stage: 'DEPOSIT', decision: 'APPROVE' }), 'permission-denied');
});

test('rates: AED only, admin MFA only, append-only history with who and when; quote lines must match', async () => {
  const R = { rateId: 'painter-day', category: 'LABOUR', unit: 'day', rateAed: 250, currency: 'AED', label: 'Painter day rate' };
  await expectHttpsError(call(m.adminSetPaintingRate, adminMfa, { ...R, currency: 'USD' }), 'failed-precondition');
  await expectHttpsError(call(m.adminSetPaintingRate, adminMfa, { ...R, rateAed: -1 }), 'failed-precondition');
  await expectHttpsError(call(m.adminSetPaintingRate, finance, R), 'permission-denied');
  await expectHttpsError(call(m.adminSetPaintingRate, aiAdmin, R), 'permission-denied');
  assert.equal((await call(m.adminSetPaintingRate, adminMfa, R)).version, 1);
  assert.equal((await call(m.adminSetPaintingRate, adminMfa, { ...R, rateAed: 275 })).version, 2);
  const hist = await db.collection('painting_rates/painter-day/history').get();
  assert.deepEqual(hist.docs.map((d) => [d.id, d.get('rateAed'), d.get('changedBy'), !!d.get('changedAt')]).sort(), [['v1', 250, adminMfa.uid, true], ['v2', 275, adminMfa.uid, true]]);
  assert.equal(hist.docs.find((d) => d.id === 'v2').get('previous').rateAed, 250);
  const audit = await db.collection('audit_logs').where('action', '==', 'PAINTING_RATE_SET').get();
  assert.equal(audit.size, 2);
  await call(m.ownerRequestPaintingProject, owner, { propertyId: 'bprop', scope: 'FULL_BUILDING', requestId: 'req-rate-0001' });
  const pid = `${owner.uid}_req-rate-0001`;
  const stale = [{ ...LINES[0], rateId: 'painter-day', unitCostAed: 250 }, ...LINES.slice(1)];
  await expectHttpsError(call(m.adminIssuePaintingQuote, adminMfa, { projectId: pid, surveyAreas: SURVEY, lines: stale, priceAed: 30000, permits: { communityNocRequired: true } }), 'failed-precondition');
  const fresh = [{ ...LINES[0], rateId: 'painter-day', unitCostAed: undefined }, ...LINES.slice(1)];
  const q = await call(m.adminIssuePaintingQuote, adminMfa, { projectId: pid, surveyAreas: SURVEY, lines: fresh, priceAed: 30000, permits: { communityNocRequired: true } });
  assert.equal(q.labourAed, undefined);
  const internal = (await db.doc(`painting_projects/${pid}/internal_quotes/v1`).get()).data();
  assert.equal(internal.costLines[0].amountAed, 24 * 275); assert.equal(internal.costLines[0].rateVersion, 2);
});

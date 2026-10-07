'use strict';
// D-5 regression: four-eyes control on Admin-recorded 15% payment evidence. The Finance Admin
// who records the manual mobilisation payment evidence (adminRecordOwnerMobilizationPaymentEvidence)
// must not be the one who approves that payment (adminApprovePayment); the refusal is audited,
// a different Finance Admin is allowed through, and Owner-submitted evidence is unaffected.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminRecordOwnerMobilizationPaymentEvidence } = lib('inspectionFirstOwnerOnboarding.js');
const { adminApprovePayment } = lib('paymentTransactionApproval.js');
const { createOwnerPaymentTransaction } = lib('contractActivation.js');
const { adminRejectPayment } = lib('paymentTransactionApproval.js');
const dualControl = lib('paymentDualControl.js');
const { adminApprovePayment: secureApprovePayment } = lib('securePaymentApproval.js');
// The deployed adminApprovePayment (securePaymentApproval.ts) runs the MFA and portfolio
// activation gates, then delegates to this handler's run(), so the check below applies live.

const WORKFLOW = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';
const OWNER = 'owner_d5';
const HASH = 'c'.repeat(64);
const MFA = { firebase: { sign_in_second_factor: 'phone' } };
const now = () => admin.firestore.Timestamp.now();
const DUAL_CONTROL = /Dual control/;

let financeA;
let financeB;
let ownerActor;
test.before(async () => {
  ownerActor = await createUser(OWNER, { role: 'owner' });
  financeA = await createUser('finance_d5_a', { role: 'finance_admin' }, { tokenExtra: MFA });
  financeB = await createUser('finance_d5_b', { role: 'finance_admin' }, { tokenExtra: MFA });
});
test.beforeEach(clearFirestore);

const baseProperty = (intakeId) => ({
  id: `${intakeId}_property_1`, propertyId: `${intakeId}_property_1`, ownerUid: OWNER, ownerId: OWNER, intakeId,
  propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3, slaTier: 'standard', paymentPlan: 'annual',
  strategy: 'maintenance', address: 'Tower D5, Unit 1, Dubai Marina', city: 'Dubai', area: 'Dubai Marina',
  geo: { lat: 25.08, lng: 55.14, address: 'Tower D5, Unit 1, Dubai Marina', emirate: 'Dubai', city: 'Dubai', area: 'Dubai Marina', verified: false, dispatchReady: false, requiresGeoReview: true },
});

// Seeds the state immediately after all property visits were evidenced (pre-completion).
async function seedInspected(intakeId) {
  const property = baseProperty(intakeId);
  await db.doc(`intake_submissions/${intakeId}`).set({
    workflowVersion: WORKFLOW, ownerUid: OWNER, ownerId: OWNER, status: 'SUBMITTED_FOR_PROPERTY_INSPECTION',
    properties: [property], inspectionIds: [`insp_${intakeId}`], selectedAddOns: [],
  });
  await db.doc(`contracts/${intakeId}`).set({
    workflowVersion: WORKFLOW, ownerUid: OWNER, ownerId: OWNER, intakeId, status: 'SIGNED', ownerSigned: true,
    signatureName: 'Owner D5', otpVerificationId: 'otp_pre', quoteHash: HASH, signatureState: { ownerSigned: true },
  });
  await db.doc(`payment_transactions/${intakeId}`).set({
    workflowVersion: WORKFLOW, ownerUid: OWNER, ownerId: OWNER, intakeId, contractId: intakeId,
    status: 'NOT_DUE_UNTIL_INSPECTION_COMPLETE', paymentStatus: 'NOT_DUE_UNTIL_INSPECTION_COMPLETE', activationDeposit: 258.75, amount: 258.75,
  });
  await db.doc(`properties/${property.propertyId}`).set({ ...property, status: 'PENDING_PROPERTY_INSPECTION' });
  await db.doc(`property_inspections/insp_${intakeId}`).set({
    id: `insp_${intakeId}`, intakeId, propertyId: property.propertyId, ownerUid: OWNER, status: 'COMPLETED',
    evidenceStatus: 'VERIFIED', evidenceHash: 'd'.repeat(64), evidenceGeneration: '1', checklistVerified: true,
    arrivalLocation: { withinRadius: true, lat: 25.0801, lng: 55.1401, expectedLat: 25.08, expectedLng: 55.14, distanceMetres: 15, accuracyMeters: 8, capturedAtMs: Date.now() },
    visitStartedAt: now(), visitCompletedAt: now(),
    pricingDriver: 'unit', pricingClass: 'apt-std', pricingVerificationStatus: 'VERIFIED',
    // Admin-verified FM inputs required by the #1479 pricing authority (explicit yes/no systems + in-band rate).
    pricingVerification: {
      units: 1, emirate: 'Dubai', zone: 'B', propertyAge: 3, slaTier: 'standard', paymentPlan: 'annual',
      floors: 1, lifts: 0, hvac: true, districtCooling: false, fireAlarm: true, firePump: false, sira: false,
      gen: false, bmu: false, tank: false, pool: false, verifiedMaintenanceRate: 2500,
    },
  });
}

async function seedPaymentConfig() {
  await db.doc('system_payment_config/current').set({
    status: 'ACTIVE', legalBeneficiary: 'BIN GROUP L.L.C - S.P.C', version: 'emulator-fixture-1', effectiveAt: now(),
    currency: 'AED', approvedMethods: ['CASH', 'CHEQUE'], officeLocation: 'Emulator fixture office',
  });
}

// Final-signed state: completion done, Owner OTP-signed the final quote, 15% now due.
async function seedFinalSigned(intakeId) {
  await seedInspected(intakeId);
  await db.doc(`contracts/${intakeId}`).set({
    status: 'OWNER_SIGNED_AWAITING_PAYMENT', inspectionVerified: true, ownerSigned: true, quoteHash: HASH,
    finalVerifiedQuoteHash: HASH, signedPdfUrl: 'https://example.invalid/contract.pdf', signatureState: { ownerSigned: true, pdfUrl: 'https://example.invalid/contract.pdf' },
  }, { merge: true });
  await db.doc(`payment_transactions/${intakeId}`).set({
    inspectionVerified: true, finalVerifiedQuoteHash: HASH, status: 'AWAITING_15_PERCENT_PAYMENT', paymentStatus: 'AWAITING_15_PERCENT_PAYMENT',
  }, { merge: true });
  await seedPaymentConfig();
}


const evidence = (paymentId) => ({
  paymentId, paymentReferenceId: 'CASH-D5-0001', paymentMethod: 'CASH', filename: 'receipt.pdf', contentType: 'application/pdf',
  encodedDocument: Buffer.from('%PDF-1.4 emulator receipt fixture').toString('base64'),
});

async function auditRows(paymentId, action) {
  const snap = await db.collection('audit_logs').where('targetId', '==', paymentId).get();
  return snap.docs.map((doc) => doc.data()).filter((row) => row.action === action);
}

test('recording evidence binds the recording Finance Admin to the payment', async () => {
  const intakeId = crypto.randomUUID();
  await seedFinalSigned(intakeId);
  await call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(intakeId));
  const payment = (await db.doc(`payment_transactions/${intakeId}`).get()).data();
  assert.equal(payment.paymentEvidenceRecordedBy, financeA.uid);
  assert.equal(payment.paymentProofEvidence.recordedBy, financeA.uid);
  assert.ok(payment.paymentEvidenceRecordedAt, 'recording time is stamped');
});

test('the Admin who recorded the evidence cannot approve the payment; the refusal is audited', async () => {
  const intakeId = crypto.randomUUID();
  await seedFinalSigned(intakeId);
  await call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(intakeId));
  const before = (await db.doc(`payment_transactions/${intakeId}`).get()).data();
  const error = await expectHttpsError(call(adminApprovePayment, financeA, { paymentId: intakeId }), 'failed-precondition');
  assert.match(error.message, DUAL_CONTROL);
  assert.equal(error.details?.reason, 'DUAL_CONTROL_SAME_ADMIN');
  const after = (await db.doc(`payment_transactions/${intakeId}`).get()).data();
  assert.equal(after.status, before.status, 'payment status is unchanged');
  assert.notEqual(after.paymentVerified, true);
  assert.equal((await db.doc(`contracts/${intakeId}`).get()).get('status'), 'OWNER_SIGNED_AWAITING_PAYMENT');
  const refusals = await auditRows(intakeId, 'ADMIN_APPROVE_PAYMENT_REFUSED_DUAL_CONTROL');
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0].actorId, financeA.uid);
  assert.equal(refusals[0].evidenceRecordedBy, financeA.uid);
  assert.equal(refusals[0].reason, 'DUAL_CONTROL_SAME_ADMIN');
  assert.equal(refusals[0].stage, 'PRE_CHECK');
  assert.equal((await auditRows(intakeId, 'ADMIN_APPROVE_PAYMENT')).length, 0);
});

test('a different Finance Admin passes dual control and reaches the remaining approval gates', async () => {
  const intakeId = crypto.randomUUID();
  await seedFinalSigned(intakeId);
  await call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(intakeId));
  await db.doc(`payment_transactions/${intakeId}`).set({ quoteHash: HASH }, { merge: true });
  // The fixture has no durable OTP record, so approval stops at the signature gate: the point is
  // that the second Admin is not stopped by D-5.
  const error = await expectHttpsError(call(adminApprovePayment, financeB, { paymentId: intakeId }), 'failed-precondition');
  assert.doesNotMatch(error.message, DUAL_CONTROL);
  assert.match(error.message, /verified owner signature/i);
  assert.equal((await auditRows(intakeId, 'ADMIN_APPROVE_PAYMENT_REFUSED_DUAL_CONTROL')).length, 0);
});

test('Admin-recorded evidence with no recorded Admin fails closed', async () => {
  const intakeId = crypto.randomUUID();
  await seedFinalSigned(intakeId);
  await db.doc(`payment_transactions/${intakeId}`).set({
    status: 'PENDING_ADMIN_APPROVAL', paymentStatus: 'PENDING_ADMIN_APPROVAL', verificationState: 'PAYMENT_EVIDENCE_RECORDED',
    paymentMethod: 'CASH', paymentReferenceId: 'CASH-D5-LEGACY',
  }, { merge: true });
  const error = await expectHttpsError(call(adminApprovePayment, financeB, { paymentId: intakeId }), 'failed-precondition');
  assert.equal(error.details?.reason, 'DUAL_CONTROL_RECORDER_UNKNOWN');
  const refusals = await auditRows(intakeId, 'ADMIN_APPROVE_PAYMENT_REFUSED_DUAL_CONTROL');
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0].reason, 'DUAL_CONTROL_RECORDER_UNKNOWN');
});

test('Owner-submitted evidence (no Admin recorder) is not subject to the Admin dual-control check', async () => {
  const intakeId = crypto.randomUUID();
  await seedFinalSigned(intakeId);
  await db.doc(`payment_transactions/${intakeId}`).set({
    status: 'PENDING_ADMIN_VERIFICATION', paymentStatus: 'PENDING_ADMIN_VERIFICATION', verificationState: 'OWNER_SUBMITTED',
    paymentMethod: 'BANK_TRANSFER', paymentReferenceId: 'OWNER-D5-REF',
  }, { merge: true });
  const error = await expectHttpsError(call(adminApprovePayment, financeA, { paymentId: intakeId }), 'failed-precondition');
  assert.doesNotMatch(error.message, DUAL_CONTROL);
});

test('dual-control decision table', () => {
  const { paymentDualControlViolation, paymentEvidenceRecorderUid } = dualControl;
  assert.equal(paymentDualControlViolation({ paymentEvidenceRecordedBy: 'a' }, 'a'), 'SAME_ADMIN');
  assert.equal(paymentDualControlViolation({ paymentProofEvidence: { recordedBy: 'a' } }, 'a'), 'SAME_ADMIN');
  assert.equal(paymentDualControlViolation({ paymentEvidenceRecordedBy: 'a' }, 'b'), null);
  assert.equal(paymentDualControlViolation({ verificationState: 'PAYMENT_EVIDENCE_RECORDED' }, 'b'), 'RECORDER_UNKNOWN');
  assert.equal(paymentDualControlViolation({ verificationState: 'OWNER_SUBMITTED' }, 'b'), null);
  assert.equal(paymentDualControlViolation({ paymentMethod: 'STRIPE', verified: true }, 'b'), null);
  assert.equal(paymentEvidenceRecorderUid({ paymentEvidenceRecordedBy: ' a ', paymentProofEvidence: { recordedBy: 'z' } }), 'a');
});

async function seedApprovable(intakeId) {
  await seedFinalSigned(intakeId);
  const schedule = { annualContractValue: 1725, activationDeposit: 258.75 };
  await db.doc(`contracts/${intakeId}`).set(schedule, { merge: true });
  await db.doc(`payment_transactions/${intakeId}`).set({ ...schedule, quoteHash: HASH }, { merge: true });
  await db.doc('contract_signature_otps/otp_pre').set({
    status: 'VERIFIED', uid: OWNER, contractId: intakeId, contractHash: HASH,
    consumedFor: intakeId, signature: 'Owner D5', verifiedAt: now(), consumedAt: now(),
  });
  await db.doc(`intake_submissions/${intakeId}`).set({ inspectionStatus: 'COMPLETED' }, { merge: true });
  const propertyRef = db.doc(`properties/${intakeId}_property_1`);
  const property = (await propertyRef.get()).data();
  const inspection = (await db.doc(`property_inspections/insp_${intakeId}`).get()).data();
  const verifiedGeo = lib('propertyGeoAuthority.js').buildInspectionVerifiedPropertyGeo(property, inspection, 'emulator-inspector', now());
  await propertyRef.set({ quoteHash: HASH, ...verifiedGeo }, { merge: true });
}

test('deployed Finance MFA wrapper allows a distinct reviewer to activate exactly once and repairs receipts on replay', async (context) => {
  // The Storage emulator stores PDF bytes but has no IAM signing service. Stub only
  // URL signing; receipt upload, hash, generation and all approval gates remain real.
  const prototype = Object.getPrototypeOf(admin.storage().bucket().file('fixture'));
  const originalSignedUrl = prototype.getSignedUrl;
  prototype.getSignedUrl = async function () { return [`https://example.invalid/${encodeURIComponent(this.name)}`]; };
  context.after(() => { prototype.getSignedUrl = originalSignedUrl; });
  const intakeId = crypto.randomUUID();
  await seedApprovable(intakeId);
  await call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(intakeId));
  assert.equal((await db.doc(`intake_submissions/${intakeId}`).get()).get('ownerOnboardingState'), 'PAYMENT_EVIDENCE_PENDING_APPROVAL');
  const refusal = await expectHttpsError(call(secureApprovePayment, financeA, { paymentId: intakeId }), 'failed-precondition');
  assert.equal(refusal.details?.reason, 'DUAL_CONTROL_SAME_ADMIN');
  const result = await call(secureApprovePayment, financeB, { paymentId: intakeId });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.idempotent, false);
  const payment = (await db.doc(`payment_transactions/${intakeId}`).get()).data();
  assert.equal(payment.paymentDualControl.evidenceRecordedBy, financeA.uid);
  assert.equal(payment.paymentDualControl.approvedBy, financeB.uid);
  assert.equal(payment.paymentVerified, true);
  assert.equal((await db.doc(`intake_submissions/${intakeId}`).get()).get('ownerOnboardingState'), 'ACTIVE');
  assert.equal((await db.doc(`contracts/${intakeId}`).get()).get('status'), 'ACTIVE');
  const replay = await call(secureApprovePayment, financeB, { paymentId: intakeId });
  assert.equal(replay.idempotent, true);
  const repairs = await call(secureApprovePayment, financeA, { paymentId: intakeId });
  assert.equal(repairs.idempotent, true, 'recording Admin may replay an already-approved decision');
  const audit = await db.collection('audit_logs').where('action', '==', 'ADMIN_APPROVE_PAYMENT').get();
  assert.equal(audit.size, 1, 'replays do not create a second financial decision');
  const invoice = (await db.doc(`invoices/${payment.invoiceId}`).get()).data();
  assert.equal(invoice.status, 'PAID');
  assert.ok(invoice.receiptStoragePath);
});

test('an upload cannot reopen a payment approved while receipt storage was in progress', async () => {
  const intakeId = crypto.randomUUID();
  await seedFinalSigned(intakeId);
  const prototype = Object.getPrototypeOf(admin.storage().bucket().file('fixture'));
  const original = prototype.save;
  prototype.save = async function (...args) {
    const result = await original.apply(this, args);
    await db.doc(`payment_transactions/${intakeId}`).set({ status: 'APPROVED', paymentVerified: true }, { merge: true });
    return result;
  };
  try {
    await expectHttpsError(call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(intakeId)), 'aborted');
  } finally { prototype.save = original; }
  const payment = (await db.doc(`payment_transactions/${intakeId}`).get()).data();
  assert.equal(payment.status, 'APPROVED');
  assert.equal(payment.paymentVerified, true);
  assert.equal(payment.paymentEvidenceRecordedBy, undefined);
});


test('receipt recording refuses an application changed during storage without changing payment evidence', async () => {
  const intakeId = crypto.randomUUID();
  await seedFinalSigned(intakeId);
  const prototype = Object.getPrototypeOf(admin.storage().bucket().file('fixture'));
  const original = prototype.save;
  prototype.save = async function (...args) {
    const result = await original.apply(this, args);
    await db.doc(`intake_submissions/${intakeId}`).set({ status: 'REJECTED', ownerOnboardingState: 'REJECTED' }, { merge: true });
    return result;
  };
  try { await expectHttpsError(call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(intakeId)), 'aborted'); }
  finally { prototype.save = original; }
  const payment = (await db.doc(`payment_transactions/${intakeId}`).get()).data();
  assert.equal(payment.status, 'AWAITING_15_PERCENT_PAYMENT');
  assert.equal(payment.paymentEvidenceRecordedBy, undefined);
  assert.equal((await db.doc(`intake_submissions/${intakeId}`).get()).get('ownerOnboardingState'), 'REJECTED');
  assert.equal((await auditRows(intakeId, 'RECORD_OWNER_15_PERCENT_PAYMENT_EVIDENCE')).length, 0);
});

async function ownerReceipt(paymentId, label = 'first') {
  const bytes = Buffer.from(`%PDF-1.4 Owner receipt ${label}`);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const storagePath = `payment-references/owners/${OWNER}/${paymentId}/${label}.pdf`;
  await admin.storage().bucket().file(storagePath).save(bytes, { resumable: false, metadata: {
    contentType: 'application/pdf', metadata: { ownerUid: OWNER, paymentId, evidenceType: 'owner_payment_receipt', receiptHash: hash },
  } });
  const config = lib('paymentConfiguration.js').resolveActivePaymentConfiguration((await db.doc('system_payment_config/current').get()).data());
  return { contractId: paymentId, method: 'CASH', paymentConfigVersion: config.version, paymentConfigHash: config.configHash, provider: 'MANUAL', currency: 'AED', amount: 258.75,
    paymentReferenceId: `OWNER-RECEIPT-${label}`, paymentProofPath: storagePath,
    paymentProofUrl: `https://example.invalid/${label}.pdf`, paymentProofHash: hash, paymentProofName: `${label}.pdf` };
}

function stubSignedUrl(context) {
  const prototype = Object.getPrototypeOf(admin.storage().bucket().file('fixture'));
  const original = prototype.getSignedUrl;
  prototype.getSignedUrl = async function () { return [`https://example.invalid/${encodeURIComponent(this.name)}`]; };
  context.after(() => { prototype.getSignedUrl = original; });
}

test('Owner first receipt on the canonical signed payment row reaches Finance approval and replays without reopening', async (context) => {
  stubSignedUrl(context);
  const id = crypto.randomUUID();
  await seedApprovable(id);
  await db.doc(`intake_submissions/${id}`).set({ ownerOnboardingState: 'OWNER_SIGNED_AWAITING_PAYMENT_EVIDENCE' }, { merge: true });
  // Exact row emitted by the real final-signature handler.
  await db.doc(`payment_transactions/${id}`).update({ status: 'PENDING_ADMIN_PAYMENT_VERIFICATION', paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION', verificationState: 'ADMIN_PAYMENT_EVIDENCE_REQUIRED_AFTER_FINAL_OWNER_SIGNATURE', ownerFinalContractSigned: true });
  const receipt = await ownerReceipt(id);
  const result = await call(createOwnerPaymentTransaction, ownerActor, receipt);
  assert.equal(result.idempotent, false);
  const payment = (await db.doc(`payment_transactions/${id}`).get()).data();
  assert.equal(payment.status, 'PENDING');
  assert.equal(payment.paymentEvidenceRecordedBy, undefined);
  assert.equal(payment.paymentProofHash, receipt.paymentProofHash);
  assert.ok(payment.paymentProofGeneration);
  assert.equal((await db.doc(`intake_submissions/${id}`).get()).get('ownerOnboardingState'), 'PAYMENT_EVIDENCE_PENDING_APPROVAL');
  assert.equal((await call(createOwnerPaymentTransaction, ownerActor, receipt)).idempotent, true);
  await expectHttpsError(call(secureApprovePayment, ownerActor, { paymentId: id }), 'permission-denied');
  assert.equal((await call(secureApprovePayment, financeA, { paymentId: id })).status, 'SUCCESS');
  assert.equal((await call(createOwnerPaymentTransaction, ownerActor, receipt)).idempotent, true);
  assert.equal((await db.doc(`intake_submissions/${id}`).get()).get('ownerOnboardingState'), 'ACTIVE');
  assert.equal((await db.doc(`payment_transactions/${id}`).get()).get('status'), 'APPROVED');
  const logs = await db.collection('audit_logs').where('action', '==', 'OWNER_CREATE_PAYMENT_TRANSACTION').get();
  assert.equal(logs.size, 1);
  assert.equal(logs.docs[0].get('paymentProofHash'), receipt.paymentProofHash);
});

test('Owner replaces rejected Admin evidence with new receipt provenance, preserving the earlier proof and audit', async (context) => {
  stubSignedUrl(context);
  const id = crypto.randomUUID();
  await seedApprovable(id);
  await call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(id));
  const previous = (await db.doc(`payment_transactions/${id}`).get()).data();
  await call(adminRejectPayment, financeB, { paymentId: id, reason: 'Receipt needs correction' });
  const receipt = await ownerReceipt(id, 'replacement');
  await call(createOwnerPaymentTransaction, ownerActor, receipt);
  const payment = (await db.doc(`payment_transactions/${id}`).get()).data();
  assert.equal(payment.paymentEvidenceRecordedBy, undefined);
  assert.equal(payment.paymentProofEvidence.recordedBy, undefined);
  assert.equal(payment.receiptPath, receipt.paymentProofPath);
  assert.equal(payment.paymentProofEvidence.receiptHash, receipt.paymentProofHash);
  assert.equal(dualControl.paymentDualControlViolation(payment, financeA.uid), null);
  assert.equal((await admin.storage().bucket().file(previous.paymentProofPath).exists())[0], true);
  assert.equal((await auditRows(id, 'RECORD_OWNER_15_PERCENT_PAYMENT_EVIDENCE')).length, 1);
  const replacementAudit = await db.collection('audit_logs').where('action', '==', 'OWNER_RESUBMIT_PAYMENT_TRANSACTION').get();
  assert.equal(replacementAudit.size, 1);
  assert.deepEqual(replacementAudit.docs[0].get('previousPaymentProof'), { storagePath: previous.paymentProofPath, receiptHash: previous.paymentProofHash, generation: previous.paymentProofGeneration, recordedBy: financeA.uid });
  assert.equal((await call(secureApprovePayment, financeA, { paymentId: id })).status, 'SUCCESS');
});

test('Owner evidence cannot bypass inspection lifecycle or a changed signature, or mutate another Owner contract', async () => {
  const id = crypto.randomUUID();
  await seedApprovable(id);
  const receipt = await ownerReceipt(id);
  await db.doc(`intake_submissions/${id}`).set({ ownerOnboardingState: 'FINAL_QUOTE_AWAITING_OWNER_SIGNATURE' }, { merge: true });
  await expectHttpsError(call(createOwnerPaymentTransaction, ownerActor, receipt), 'failed-precondition');
  assert.equal((await db.doc(`payment_transactions/${id}`).get()).get('status'), 'AWAITING_15_PERCENT_PAYMENT');
  const other = await createUser('other_owner_d5', { role: 'owner' });
  await expectHttpsError(call(createOwnerPaymentTransaction, other, receipt), 'permission-denied');
  await db.doc(`intake_submissions/${id}`).set({ ownerOnboardingState: 'OWNER_SIGNED_AWAITING_PAYMENT_EVIDENCE' }, { merge: true });
  const original = db.runTransaction;
  db.runTransaction = async function (...args) {
    await db.doc(`contracts/${id}`).update({ ownerSigned: false, signatureState: { ownerSigned: false } });
    return original.apply(this, args);
  };
  try { await expectHttpsError(call(createOwnerPaymentTransaction, ownerActor, receipt), 'aborted'); }
  finally { db.runTransaction = original; }
  assert.equal((await db.doc(`payment_transactions/${id}`).get()).get('status'), 'AWAITING_15_PERCENT_PAYMENT');
  assert.equal((await db.collection('audit_logs').get()).size, 0);
});

test('Finance rejects an unknown recorded lifecycle before repairing any financial document', async () => {
  const id = crypto.randomUUID();
  await seedApprovable(id);
  await call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(id));
  await db.doc(`intake_submissions/${id}`).set({ ownerOnboardingState: 'UNKNOWN_APPROVED' }, { merge: true });
  await expectHttpsError(call(adminApprovePayment, financeB, { paymentId: id }), 'failed-precondition');
  assert.equal((await db.collection('invoices').get()).size, 0);
  assert.equal((await db.doc(`contracts/${id}`).get()).get('invoiceId'), undefined);
  assert.equal((await db.doc(`payment_transactions/${id}`).get()).get('paymentVerified'), undefined);
});

test('legacy Owner pending evidence derives a review state only from a signed inspection and bound receipt', async (context) => {
  stubSignedUrl(context);
  const id = crypto.randomUUID();
  await seedApprovable(id);
  const receipt = await ownerReceipt(id, 'legacy');
  await call(createOwnerPaymentTransaction, ownerActor, receipt);
  await db.doc(`intake_submissions/${id}`).update({ ownerOnboardingState: admin.firestore.FieldValue.delete() });
  assert.equal((await call(secureApprovePayment, financeA, { paymentId: id })).status, 'SUCCESS');
  assert.equal((await db.doc(`intake_submissions/${id}`).get()).get('ownerOnboardingState'), 'ACTIVE');
});

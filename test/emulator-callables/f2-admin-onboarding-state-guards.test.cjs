'use strict';
// F-2 regression: Admin portfolio completion and 15% payment-evidence recording must not
// regress a final-signed / approved / ACTIVE application, and evidence recording is an
// MFA finance-Admin payment decision.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminCompleteOwnerPortfolioInspections } = lib('canonicalOwnerInspectionCompletion.js');
const { adminRecordOwnerMobilizationPaymentEvidence } = lib('inspectionFirstOwnerOnboarding.js');

const WORKFLOW = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';
const OWNER = 'owner_f2';
const HASH = 'c'.repeat(64);
const MFA = { firebase: { sign_in_second_factor: 'phone' } };
const now = () => admin.firestore.Timestamp.now();

let financeMfa;
let adminNoMfa;
let opsMfa;
test.before(async () => {
  financeMfa = await createUser('finance_f2', { role: 'finance_admin' }, { tokenExtra: MFA });
  adminNoMfa = await createUser('admin_f2_nomfa', { role: 'admin' });
  opsMfa = await createUser('ops_f2', { role: 'operations_admin' }, { tokenExtra: MFA });
});
test.beforeEach(clearFirestore);

const baseProperty = (intakeId) => ({
  id: `${intakeId}_property_1`, propertyId: `${intakeId}_property_1`, ownerUid: OWNER, ownerId: OWNER, intakeId,
  propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3, slaTier: 'standard', paymentPlan: 'annual',
  strategy: 'maintenance', address: 'Tower F2, Unit 1, Dubai Marina', city: 'Dubai', area: 'Dubai Marina',
  geo: { lat: 25.08, lng: 55.14, address: 'Tower F2, Unit 1, Dubai Marina', emirate: 'Dubai', city: 'Dubai', area: 'Dubai Marina', verified: false, dispatchReady: false, requiresGeoReview: true },
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
    signatureName: 'Owner F2', otpVerificationId: 'otp_pre', quoteHash: HASH, signatureState: { ownerSigned: true },
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

async function seedActive(intakeId) {
  await seedFinalSigned(intakeId);
  await db.doc(`intake_submissions/${intakeId}`).set({ status: 'ACTIVE' }, { merge: true });
  await db.doc(`contracts/${intakeId}`).set({ status: 'ACTIVE', adminApproved: true }, { merge: true });
  await db.doc(`payment_transactions/${intakeId}`).set({ status: 'APPROVED', paymentStatus: 'APPROVED', paymentVerified: true, approved: true }, { merge: true });
}

const evidence = (paymentId) => ({
  paymentId, paymentReferenceId: 'CASH-F2-0001', paymentMethod: 'CASH', filename: 'receipt.pdf', contentType: 'application/pdf',
  encodedDocument: Buffer.from('%PDF-1.4 emulator receipt fixture').toString('base64'),
});
const completion = (intakeId) => ({ intakeId, notes: 'All portfolio visits evidenced and verified.' });

test('completion still works for an inspected, not-yet-final-signed application', async () => {
  const intakeId = crypto.randomUUID();
  await seedInspected(intakeId);
  await call(adminCompleteOwnerPortfolioInspections, financeMfa, completion(intakeId));
  const contract = (await db.doc(`contracts/${intakeId}`).get()).data();
  assert.equal(contract.status, 'PENDING_OWNER_SIGNATURE');
});

test('completion re-run cannot regress an ACTIVE application', async () => {
  const intakeId = crypto.randomUUID();
  await seedActive(intakeId);
  const error = await expectHttpsError(call(adminCompleteOwnerPortfolioInspections, financeMfa, completion(intakeId)), 'failed-precondition');
  assert.match(error.message, /locked/i);
  const [contract, payment] = await Promise.all([db.doc(`contracts/${intakeId}`).get(), db.doc(`payment_transactions/${intakeId}`).get()]);
  assert.equal(contract.get('status'), 'ACTIVE');
  assert.equal(contract.get('ownerSigned'), true);
  assert.equal(payment.get('status'), 'APPROVED');
});

test('completion re-run cannot discard the Owner final signature', async () => {
  const intakeId = crypto.randomUUID();
  await seedFinalSigned(intakeId);
  await expectHttpsError(call(adminCompleteOwnerPortfolioInspections, financeMfa, completion(intakeId)), 'failed-precondition');
  const contract = (await db.doc(`contracts/${intakeId}`).get()).data();
  assert.equal(contract.ownerSigned, true);
  assert.equal(contract.signedPdfUrl, 'https://example.invalid/contract.pdf');
});

test('MFA finance Admin can record 15% evidence on a final-signed application', async () => {
  const intakeId = crypto.randomUUID();
  await seedFinalSigned(intakeId);
  await call(adminRecordOwnerMobilizationPaymentEvidence, financeMfa, evidence(intakeId));
  const payment = (await db.doc(`payment_transactions/${intakeId}`).get()).data();
  assert.notEqual(payment.status, 'APPROVED');
  assert.ok(/^[a-f0-9]{64}$/.test(payment.paymentProofHash || payment.receiptHash));
});

test('evidence re-recording cannot reopen an approved payment', async () => {
  const intakeId = crypto.randomUUID();
  await seedActive(intakeId);
  const error = await expectHttpsError(call(adminRecordOwnerMobilizationPaymentEvidence, financeMfa, evidence(intakeId)), 'failed-precondition');
  assert.match(error.message, /already approved/i);
  const payment = (await db.doc(`payment_transactions/${intakeId}`).get()).data();
  assert.equal(payment.status, 'APPROVED');
  assert.equal(payment.paymentVerified, true);
});

test('evidence recording requires an MFA session and a finance-capable Admin role', async () => {
  const intakeId = crypto.randomUUID();
  await seedFinalSigned(intakeId);
  await expectHttpsError(call(adminRecordOwnerMobilizationPaymentEvidence, adminNoMfa, evidence(intakeId)), 'permission-denied');
  await expectHttpsError(call(adminRecordOwnerMobilizationPaymentEvidence, opsMfa, evidence(intakeId)), 'permission-denied');
  const payment = (await db.doc(`payment_transactions/${intakeId}`).get()).data();
  assert.equal(payment.status, 'AWAITING_15_PERCENT_PAYMENT');
});

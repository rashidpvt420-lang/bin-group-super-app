'use strict';
// F-1 regression: the deployed Owner submission callable (canonical wrapper) must bind every
// application record to the submitting Owner and never reset a progressed application.
// Before the fix: (a) re-submitting an ACTIVE application reset contract/payment/property to
// pre-inspection states; (b) a second Owner who knew the intakeId took over all records.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { submitOwnerInspectionFirstOnboarding } = lib('canonicalOwnerSubmission.js');
const { requestOwnerInspectionSignatureOtp } = lib('inspectionFirstOwnerOnboarding.js');
const { upsertOwnerOnboardingProfile } = lib('ownerOnboarding.js');
const { calculateOwnerOnboardingQuote } = lib('ownerOnboardingQuote.js');

let ownerA;
let ownerB;
test.before(async () => {
  ownerA = await createUser('owner_f1_a', { role: 'owner' });
  ownerB = await createUser('owner_f1_b', { role: 'owner' });
});
test.beforeEach(clearFirestore);

const property = (address, lat, lng) => ({
  id: 'draft_1', propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3,
  slaTier: 'standard', paymentPlan: 'annual', strategy: 'maintenance', address,
  geo: { lat, lng, address, source: 'device_gps' },
});
const PROPERTY_A = property('Tower A, Unit 101, Dubai Marina', 25.08, 55.14);
const PROPERTY_B = property('Villa 7, Street 12, Al Barsha, Dubai', 25.11, 55.2);

// Stands in for requestOwnerInspectionSignatureOtp + verifyOwnerInspectionSignatureOtp (email OTP
// delivery is not available in the emulator). The OTP document shape matches assertVerifiedOtp.
async function verifiedOtp(owner, contractId, quoteHash) {
  const id = `otp_${crypto.randomUUID()}`;
  await db.doc(`contract_signature_otps/${id}`).set({
    status: 'VERIFIED', uid: owner.uid, contractId, contractHash: quoteHash, signature: `Owner ${owner.uid}`,
    evidenceExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3_600_000),
  });
  return id;
}

async function submit(owner, intakeId, prop) {
  const quotedAtMs = Date.now() - 1000;
  const quote = calculateOwnerOnboardingQuote([prop], [], quotedAtMs);
  const otpVerificationId = await verifiedOtp(owner, intakeId, quote.quoteHash);
  return call(submitOwnerInspectionFirstOnboarding, owner, {
    intakeId, ownerUid: owner.uid, ownerEmail: owner.token.email, properties: [prop], selectedAddOns: [],
    quoteHash: quote.quoteHash, quoteQuotedAtMs: quotedAtMs, signatureName: `Owner ${owner.uid}`, otpVerificationId,
    documentUrls: { propertyProof: 'https://example.invalid/p', emiratesId: 'https://example.invalid/e', passport: 'https://example.invalid/x' },
  });
}

async function records(intakeId) {
  const [intake, contract, payment, prop] = await Promise.all([
    db.doc(`intake_submissions/${intakeId}`).get(), db.doc(`contracts/${intakeId}`).get(),
    db.doc(`payment_transactions/${intakeId}`).get(), db.doc(`properties/${intakeId}_property_1`).get(),
  ]);
  return { intake: intake.data(), contract: contract.data(), payment: payment.data(), property: prop.data() };
}

async function activateFixture(intakeId) {
  // Simulates the end state of inspection + final signature + adminApprovePayment.
  await db.doc(`intake_submissions/${intakeId}`).set({ status: 'ACTIVE', activationState: 'ACTIVE' }, { merge: true });
  await db.doc(`contracts/${intakeId}`).set({ status: 'ACTIVE', adminApproved: true, ownerSigned: true }, { merge: true });
  await db.doc(`payment_transactions/${intakeId}`).set({ status: 'APPROVED', paymentStatus: 'APPROVED', paymentVerified: true }, { merge: true });
  await db.doc(`properties/${intakeId}_property_1`).set({ status: 'ACTIVE', geo: { verified: true, dispatchReady: true } }, { merge: true });
}

test('first submission succeeds and binds every record to the submitting Owner; replay is idempotent', async () => {
  const intakeId = crypto.randomUUID();
  const first = await submit(ownerA, intakeId, PROPERTY_A);
  assert.equal(first.idempotent, false);
  const state = await records(intakeId);
  for (const record of Object.values(state)) assert.equal(record.ownerUid, ownerA.uid);
  assert.equal(state.intake.status, 'SUBMITTED_FOR_PROPERTY_INSPECTION');
  const replay = await submit(ownerA, intakeId, PROPERTY_A);
  assert.equal(replay.idempotent, true);
});

test('ACTIVE-reset: the same Owner cannot resubmit an activated application', async () => {
  const intakeId = crypto.randomUUID();
  await submit(ownerA, intakeId, PROPERTY_A);
  await activateFixture(intakeId);
  await expectHttpsError(submit(ownerA, intakeId, PROPERTY_A), 'failed-precondition');
  const state = await records(intakeId);
  assert.equal(state.intake.status, 'ACTIVE');
  assert.equal(state.contract.status, 'ACTIVE');
  assert.equal(state.contract.adminApproved, true);
  assert.equal(state.payment.status, 'APPROVED');
  assert.equal(state.property.status, 'ACTIVE');
  assert.equal(state.property.geo.verified, true);
});

test('cross-owner takeover: another Owner cannot submit onto an existing application ID', async () => {
  const intakeId = crypto.randomUUID();
  await submit(ownerA, intakeId, PROPERTY_A);
  await activateFixture(intakeId);
  await expectHttpsError(submit(ownerB, intakeId, PROPERTY_B), 'permission-denied');
  const state = await records(intakeId);
  for (const record of Object.values(state)) assert.equal(record.ownerUid, ownerA.uid);
  assert.equal(state.property.address, PROPERTY_A.address);
  const claims = await db.collection('property_identity_registry').where('ownerUid', '==', ownerB.uid).get();
  assert.equal(claims.size, 0, 'rejected submissions must not leave property identity claims');
});

test('cross-owner takeover is also refused while the victim application is still pending inspection', async () => {
  const intakeId = crypto.randomUUID();
  await submit(ownerA, intakeId, PROPERTY_A);
  await expectHttpsError(submit(ownerB, intakeId, PROPERTY_B), 'permission-denied');
  assert.equal((await records(intakeId)).intake.ownerUid, ownerA.uid);
});

test('OTP requests are bound to the caller: another Owner cannot request an OTP for A application', async () => {
  const intakeId = crypto.randomUUID();
  await submit(ownerA, intakeId, PROPERTY_A);
  await expectHttpsError(call(requestOwnerInspectionSignatureOtp, ownerB, { contractId: intakeId, contractHash: 'b'.repeat(64) }), 'permission-denied');
  const issued = await db.collection('contract_signature_otps').where('uid', '==', ownerB.uid).get();
  assert.equal(issued.size, 0);
});

test('profile upsert cannot rebind another Owner application to the caller', async () => {
  const intakeId = crypto.randomUUID();
  await submit(ownerA, intakeId, PROPERTY_A);
  await expectHttpsError(call(upsertOwnerOnboardingProfile, ownerB, {
    email: ownerB.token.email, fullName: 'Owner B', mobile: '+971500000000', intakeId,
  }), 'permission-denied');
  assert.equal((await records(intakeId)).intake.ownerUid, ownerA.uid);
});

test('new applications need an unguessable UUID or a caller-scoped ID', async () => {
  await expectHttpsError(submit(ownerB, `owner_${ownerA.uid}`, PROPERTY_B), 'invalid-argument');
  await expectHttpsError(submit(ownerB, 'guessable-reference-123', PROPERTY_B), 'invalid-argument');
  await expectHttpsError(call(requestOwnerInspectionSignatureOtp, ownerB, { contractId: 'guessable-reference-123', contractHash: 'b'.repeat(64) }), 'invalid-argument');
  const fallback = await submit(ownerB, `owner_${ownerB.uid}`, PROPERTY_B);
  assert.equal(fallback.idempotent, false);
});

test('an Owner can still submit after the profile step created the intake binding', async () => {
  const intakeId = crypto.randomUUID();
  await call(upsertOwnerOnboardingProfile, ownerA, { email: ownerA.token.email, fullName: 'Owner A', mobile: '+971500000001', intakeId });
  assert.equal((await records(intakeId)).intake.ownerUid, ownerA.uid);
  const result = await submit(ownerA, intakeId, PROPERTY_A);
  assert.equal(result.idempotent, false);
  assert.equal((await records(intakeId)).intake.status, 'SUBMITTED_FOR_PROPERTY_INSPECTION');
});

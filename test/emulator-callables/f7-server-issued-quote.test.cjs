'use strict';
// F-7 regression: quoteHash was an unkeyed SHA-256 over the quote body including the client-supplied
// quotedAtMs, so a client could recompute a "fresh" quote locally (bypassing the 72 h expiry) and
// the server accepted it. Submission now requires a server issuance record for the same Owner.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { submitOwnerInspectionFirstOnboarding } = lib('canonicalOwnerSubmission.js');
const { previewOwnerInspectionQuote } = lib('inspectionFirstOwnerOnboarding.js');
const { calculateOwnerOnboardingQuote } = lib('ownerOnboardingQuote.js');

let ownerA;
let ownerB;
test.before(async () => {
  ownerA = await createUser('owner_f7_a', { role: 'owner' });
  ownerB = await createUser('owner_f7_b', { role: 'owner' });
});
test.beforeEach(clearFirestore);

const PROPERTY = {
  id: 'draft_1', propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3,
  slaTier: 'standard', paymentPlan: 'annual', strategy: 'maintenance', address: 'Tower F7, Unit 7, Dubai Marina',
  geo: { lat: 25.08, lng: 55.14, address: 'Tower F7, Unit 7, Dubai Marina', source: 'device_gps' },
};

async function verifiedOtp(owner, contractId, quoteHash) {
  const id = `otp_${crypto.randomUUID()}`;
  await db.doc(`contract_signature_otps/${id}`).set({
    status: 'VERIFIED', uid: owner.uid, contractId, contractHash: quoteHash, signature: `Owner ${owner.uid}`,
    evidenceExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3_600_000),
  });
  return id;
}

async function submitWith(owner, quote) {
  const intakeId = crypto.randomUUID();
  const otpVerificationId = await verifiedOtp(owner, intakeId, quote.quoteHash);
  return call(submitOwnerInspectionFirstOnboarding, owner, {
    intakeId, ownerUid: owner.uid, ownerEmail: owner.token.email, properties: [PROPERTY], selectedAddOns: [],
    quoteHash: quote.quoteHash, quoteQuotedAtMs: quote.quotedAtMs, signatureName: `Owner ${owner.uid}`, otpVerificationId,
    documentUrls: { propertyProof: 'https://example.invalid/p', emiratesId: 'https://example.invalid/e', passport: 'https://example.invalid/x' },
  });
}

test('a server-issued quote can be submitted', async () => {
  const quote = await call(previewOwnerInspectionQuote, ownerA, { properties: [PROPERTY], selectedAddOns: [] });
  const issuance = await db.doc(`owner_quote_issuances/${ownerA.uid}_${quote.quoteHash}`).get();
  assert.equal(issuance.exists, true);
  assert.equal(issuance.data().quotedAtMs, quote.quotedAtMs);
  const result = await submitWith(ownerA, quote);
  assert.ok(result);
});

test('a quote recomputed on the client with a refreshed timestamp is rejected', async () => {
  // e.g. an expired quote "refreshed" locally: same prices, new quotedAtMs, valid unkeyed hash.
  const forged = calculateOwnerOnboardingQuote([PROPERTY], [], Date.now() - 1000);
  await expectHttpsError(submitWith(ownerA, forged), 'failed-precondition');
  const intakes = await db.collection('intake_submissions').get();
  assert.equal(intakes.size, 0, 'no application may be created from a forged quote');
});

test('a quote issued to another Owner cannot be reused', async () => {
  const quote = await call(previewOwnerInspectionQuote, ownerB, { properties: [PROPERTY], selectedAddOns: [] });
  await expectHttpsError(submitWith(ownerA, quote), 'failed-precondition');
});

test('an issued quote with a tampered timestamp is rejected', async () => {
  const quote = await call(previewOwnerInspectionQuote, ownerA, { properties: [PROPERTY], selectedAddOns: [] });
  const retimed = calculateOwnerOnboardingQuote([PROPERTY], [], quote.quotedAtMs - 5000);
  await expectHttpsError(submitWith(ownerA, retimed), 'failed-precondition');
});

'use strict';
// F-8 regression: the Owner browser tagged typed/dropped pins with source "admin_manual", which is
// the Founder-MFA verification provenance. The submission callable must never persist a
// server-authority geo source from an Owner.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call } = require('./_setup.cjs');

const { submitOwnerInspectionFirstOnboarding } = lib('canonicalOwnerSubmission.js');
const { previewOwnerInspectionQuote } = lib('inspectionFirstOwnerOnboarding.js');

let owner;
test.before(async () => { owner = await createUser('owner_f8', { role: 'owner' }); });
test.beforeEach(clearFirestore);

const property = (source) => ({
  id: 'draft_1', propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3,
  slaTier: 'standard', paymentPlan: 'annual', strategy: 'maintenance', address: 'Tower F8, Unit 8, JLT, Dubai',
  geo: { lat: 25.0693, lng: 55.1413, address: 'Tower F8, Unit 8, JLT, Dubai', source },
});

async function ownerDocuments(intakeId) {
  const bucket = admin.storage().bucket();
  const paths = {};
  for (const key of ['propertyProof', 'emiratesId', 'passport']) {
    const path = `onboarding-proof/${owner.uid}/${intakeId}/${key}/1_${key}.pdf`;
    await bucket.file(path).save(Buffer.from(`%PDF-1.4 ${key}`), { resumable: false, metadata: { contentType: 'application/pdf', metadata: { ownerUid: owner.uid, docType: key } } });
    paths[key] = path;
  }
  return paths;
}

async function submittedGeoSource(source) {
  const intakeId = crypto.randomUUID();
  const prop = property(source);
  const quote = await call(previewOwnerInspectionQuote, owner, { properties: [prop], selectedAddOns: [] });
  const otpId = `otp_${crypto.randomUUID()}`;
  await db.doc(`contract_signature_otps/${otpId}`).set({
    status: 'VERIFIED', uid: owner.uid, contractId: intakeId, contractHash: quote.quoteHash, signature: `Owner ${owner.uid}`,
    evidenceExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3_600_000),
  });
  await call(submitOwnerInspectionFirstOnboarding, owner, {
    intakeId, ownerUid: owner.uid, ownerEmail: owner.token.email, properties: [prop], selectedAddOns: [],
    quoteHash: quote.quoteHash, quoteQuotedAtMs: quote.quotedAtMs, signatureName: `Owner ${owner.uid}`, otpVerificationId: otpId,
    documentUrls: await ownerDocuments(intakeId),
  });
  const saved = (await db.doc(`properties/${intakeId}_property_1`).get()).data();
  return saved.geo.source;
}

for (const forged of ['admin_manual', 'ADMIN_MANUAL', 'physical_inspection']) {
  test(`an Owner submission tagged "${forged}" is stored as owner_manual`, async () => {
    assert.equal(await submittedGeoSource(forged), 'owner_manual');
  });
}

for (const legitimate of ['device_gps', 'google_maps', 'owner_manual']) {
  test(`a legitimate Owner source "${legitimate}" is preserved`, async () => {
    assert.equal(await submittedGeoSource(legitimate), legitimate);
  });
}

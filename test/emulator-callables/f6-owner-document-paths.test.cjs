'use strict';
// F-6 regression: Owner onboarding accepted any non-empty string as "property proof / identity"
// (documentUrls were only checked for being non-empty) and identity documents were stored with
// permanent Firebase download-token URLs.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { submitOwnerInspectionFirstOnboarding } = lib('canonicalOwnerSubmission.js');
const { previewOwnerInspectionQuote, uploadOwnerInspectionProofDocument } = lib('inspectionFirstOwnerOnboarding.js');
const { getOwnerOnboardingDocumentLink } = lib('ownerOnboardingDocuments.js');

// Signing needs service-account credentials the emulator does not have; stub only the signer.
const storageModule = require(require.resolve('@google-cloud/storage', { paths: [path.join(__dirname, '..', '..', 'functions')] }));
const signed = [];
storageModule.File.prototype.getSignedUrl = async function stubbedSignedUrl(config) {
  signed.push({ name: this.name, expires: Number(config.expires) });
  return [`https://storage.googleapis.com/signed/${encodeURIComponent(this.name)}?X-Goog-Expires=300`];
};

let ownerA;
let ownerB;
let adminUser;
test.before(async () => {
  ownerA = await createUser('owner_f6_a', { role: 'owner' });
  ownerB = await createUser('owner_f6_b', { role: 'owner' });
  adminUser = await createUser('admin_f6', { role: 'admin', admin: true });
});
test.beforeEach(clearFirestore);

const PROPERTY = {
  id: 'draft_1', propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3,
  slaTier: 'standard', paymentPlan: 'annual', strategy: 'maintenance', address: 'Tower F6, Unit 6, Dubai Marina',
  geo: { lat: 25.08, lng: 55.14, address: 'Tower F6, Unit 6, Dubai Marina', source: 'device_gps' },
};

async function upload(owner, intakeId, docType) {
  return call(uploadOwnerInspectionProofDocument, owner, {
    ownerUid: owner.uid, ownerEmail: owner.token.email, intakeId, docType,
    filename: `${docType}.pdf`, contentType: 'application/pdf', encodedDocument: Buffer.from(`%PDF-1.4 ${docType}`).toString('base64'),
  });
}

async function uploadAll(owner, intakeId) {
  const out = {};
  for (const key of ['propertyProof', 'emiratesId', 'passport']) out[key] = (await upload(owner, intakeId, key)).storagePath;
  return out;
}

async function submit(owner, intakeId, documents) {
  const quote = await call(previewOwnerInspectionQuote, owner, { properties: [PROPERTY], selectedAddOns: [] });
  const otpId = `otp_${crypto.randomUUID()}`;
  await db.doc(`contract_signature_otps/${otpId}`).set({
    status: 'VERIFIED', uid: owner.uid, contractId: intakeId, contractHash: quote.quoteHash, signature: `Owner ${owner.uid}`,
    evidenceExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3_600_000),
  });
  return call(submitOwnerInspectionFirstOnboarding, owner, {
    intakeId, ownerUid: owner.uid, ownerEmail: owner.token.email, properties: [PROPERTY], selectedAddOns: [],
    quoteHash: quote.quoteHash, quoteQuotedAtMs: quote.quotedAtMs, signatureName: `Owner ${owner.uid}`, otpVerificationId: otpId,
    ...documents,
  });
}

test('the protected upload stores an Owner-tagged object without a permanent download token', async () => {
  const intakeId = crypto.randomUUID();
  const result = await upload(ownerA, intakeId, 'emiratesId');
  assert.equal(result.downloadUrl, undefined, 'no permanent download URL may be returned');
  assert.ok(result.storagePath.startsWith(`onboarding-proof/${ownerA.uid}/${intakeId}/emiratesId/`));
  const [metadata] = await admin.storage().bucket().file(result.storagePath).getMetadata();
  assert.equal(metadata.metadata.ownerUid, ownerA.uid);
  assert.equal(metadata.metadata.firebaseStorageDownloadTokens, undefined);
});

test('arbitrary URLs are rejected as Owner documents and no application is created', async () => {
  const intakeId = crypto.randomUUID();
  await expectHttpsError(submit(ownerA, intakeId, {
    documentUrls: { propertyProof: 'https://example.invalid/p', emiratesId: 'https://example.invalid/e', passport: 'https://example.invalid/x' },
  }), 'failed-precondition');
  assert.equal((await db.doc(`intake_submissions/${intakeId}`).get()).exists, false);
});

test("another Owner's uploaded documents cannot be submitted", async () => {
  const intakeId = crypto.randomUUID();
  const othersPaths = await uploadAll(ownerB, intakeId);
  // Sent in the legacy documentUrls field too, which the old code accepted as long as it was non-empty.
  await expectHttpsError(submit(ownerA, intakeId, { documentUrls: othersPaths }), 'failed-precondition');
  assert.equal((await db.doc(`intake_submissions/${intakeId}`).get()).exists, false);
});

test('an own-prefix path with no uploaded object is rejected', async () => {
  const intakeId = crypto.randomUUID();
  const paths = await uploadAll(ownerA, intakeId);
  paths.passport = `onboarding-proof/${ownerA.uid}/${intakeId}/passport/never_uploaded.pdf`;
  await expectHttpsError(submit(ownerA, intakeId, { documentUrls: paths }), 'failed-precondition');
  assert.equal((await db.doc(`intake_submissions/${intakeId}`).get()).exists, false);
});

test('verified paths are stored (legacy Storage URLs are reduced to paths); no bearer URLs persist', async () => {
  const intakeId = crypto.randomUUID();
  const paths = await uploadAll(ownerA, intakeId);
  const legacyUrl = `https://firebasestorage.googleapis.com/v0/b/demo/o/${encodeURIComponent(paths.propertyProof)}?alt=media&token=abc`;
  await submit(ownerA, intakeId, { documentUrls: { ...paths, propertyProof: legacyUrl } });
  const intake = (await db.doc(`intake_submissions/${intakeId}`).get()).data();
  assert.deepEqual(intake.documentPaths, paths);
  assert.deepEqual(intake.documentUrls, {});
  assert.equal(JSON.stringify(intake).includes('token='), false);
  const contract = (await db.doc(`contracts/${intakeId}`).get()).data();
  assert.deepEqual(contract.documentPaths, paths);
  assert.deepEqual(contract.documentUrls, {});
});

test('document links are short-lived, limited to the Owner and Admins, and audit-logged', async () => {
  const intakeId = crypto.randomUUID();
  const paths = await uploadAll(ownerA, intakeId);
  await submit(ownerA, intakeId, { documentPaths: paths });
  signed.length = 0;
  const own = await call(getOwnerOnboardingDocumentLink, ownerA, { intakeId, key: 'emiratesId' });
  assert.equal(own.expiresInSeconds, 300);
  assert.equal(signed[0].name, paths.emiratesId);
  assert.ok(signed[0].expires - Date.now() <= 300_000 && signed[0].expires - Date.now() > 250_000);
  const byAdmin = await call(getOwnerOnboardingDocumentLink, adminUser, { intakeId, key: 'passport' });
  assert.ok(byAdmin.url);
  await expectHttpsError(call(getOwnerOnboardingDocumentLink, ownerB, { intakeId, key: 'emiratesId' }), 'permission-denied');
  const logs = await db.collection('audit_logs').where('action', '==', 'OWNER_ONBOARDING_DOCUMENT_ACCESSED').get();
  assert.equal(logs.size, 2);
});

'use strict';
// Regression: the Admin site-visit pricing payload (adminRecordOwnerPropertyInspectionEvidence)
// rounded every verified input to two decimals. A fractional unit/bed/lift count (12.5 units)
// was accepted and then multiplied into the authoritative per-unit quote, and sub-fils AED
// values (Maintenance rate 2000.555, annual rent 600000.005) were silently rounded instead of
// rejected, unlike the other money inputs since #1528. Counts must be whole numbers and AED
// amounts must be exact to the fils; no inspection evidence may be stored for a rejected payload.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { submitOwnerInspectionFirstOnboarding } = lib('canonicalOwnerSubmission.js');
const { previewOwnerInspectionQuote, uploadOwnerInspectionProofDocument } = lib('inspectionFirstOwnerOnboarding.js');
const { adminCreateOwnerPortfolioPropertyInspection, adminLinkOwnerPropertyInspection } = lib('ownerInspectionAdminLink.js');
const { adminRecordOwnerPropertyInspectionEvidence } = lib('ownerInspectionCompletion.js');

const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6300010000050001', 'hex').toString('base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');

let owner;
let adminUser;
test.before(async () => {
  owner = await createUser('owner_vpx', { role: 'owner' });
  adminUser = await createUser('admin_vpx', { role: 'admin', admin: true }, { tokenExtra: { firebase: { sign_in_second_factor: 'totp' } } });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('system_payment_config/current').set({
    status: 'ACTIVE', legalBeneficiary: 'BIN GROUP L.L.C - S.P.C', version: 'vpx-v1', effectiveAt: admin.firestore.Timestamp.now(),
    currency: 'AED', officeLocation: 'BIN GROUP Office, Dubai (test fixture)', approvedMethods: ['CASH', 'CHEQUE'],
    bankTransferEnabled: false, stripeEnabled: false,
  });
});

function property(strategy) {
  return {
    id: 'draft_1', propertyId: 'draft_1', propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 12, age: 5,
    slaTier: 'standard', paymentPlan: 'annual', strategy, annualRent: 600000, city: 'Dubai', area: 'Dubai Marina',
    address: 'VPX Tower, Dubai Marina', geo: { lat: 25.0801, lng: 55.1402, address: 'VPX Tower, Dubai Marina', source: 'device_gps' },
  };
}

async function inspectionFor(strategy) {
  const intakeId = crypto.randomUUID();
  const prop = property(strategy);
  const quote = await call(previewOwnerInspectionQuote, owner, { properties: [prop], selectedAddOns: [] });
  const otpId = `otp_${crypto.randomUUID()}`;
  await db.doc(`contract_signature_otps/${otpId}`).set({
    status: 'VERIFIED', uid: owner.uid, contractId: intakeId, contractHash: quote.quoteHash, signature: 'VPX Owner',
    evidenceExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3_600_000),
  });
  const documentPaths = {};
  for (const docType of ['propertyProof', 'emiratesId', 'passport']) {
    const r = await call(uploadOwnerInspectionProofDocument, owner, {
      ownerUid: owner.uid, ownerEmail: owner.token.email, intakeId, docType, filename: `${docType}.pdf`, contentType: 'application/pdf', encodedDocument: PDF,
    });
    documentPaths[docType] = r.storagePath;
  }
  await call(submitOwnerInspectionFirstOnboarding, owner, {
    intakeId, ownerUid: owner.uid, ownerEmail: owner.token.email, ownerName: 'VPX Owner', ownerMobile: '+971500001111',
    properties: [prop], selectedAddOns: [], quoteHash: quote.quoteHash, quoteQuotedAtMs: quote.quotedAtMs,
    signatureName: 'VPX Owner', otpVerificationId: otpId, documentPaths,
  });
  const { inspectionId } = await call(adminCreateOwnerPortfolioPropertyInspection, adminUser, { intakeId, propertyIndex: 0 });
  await call(adminLinkOwnerPropertyInspection, adminUser, { intakeId, inspectionIds: [inspectionId] });
  return { intakeId, inspectionId };
}

function evidence(intakeId, inspectionId, pricing) {
  return call(adminRecordOwnerPropertyInspectionEvidence, adminUser, {
    intakeId, inspectionId, inspectorName: 'VPX Admin', findings: 'Site visit findings recorded.',
    startedAtMs: Date.now() - 3_600_000, completedAtMs: Date.now() - 60_000, arrivalLat: 25.0802, arrivalLng: 55.1403,
    checklist: { propertyIdentityConfirmed: true, locationConfirmed: true, accessAndSafetyReviewed: true, systemsAndConditionReviewed: true, serviceScopeConfirmed: true },
    contentType: 'image/png', encodedDocument: PNG,
    pricingVerification: {
      units: 12, propertyAge: 5, emirate: 'Dubai', zone: 'B', slaTier: 'standard', paymentPlan: 'annual', floors: 4, lifts: 1, hvacCount: 12,
      hvac: true, districtCooling: false, fireAlarm: true, firePump: false, sira: true, gen: false, bmu: false, tank: true, pool: false,
      verifiedMaintenanceRate: 2000, annualRent: 600000, verifiedManagementRate: 5, ...pricing,
    },
  });
}

async function assertNoEvidenceStored(inspectionId) {
  const snap = await db.doc(`property_inspections/${inspectionId}`).get();
  const data = snap.data() || {};
  assert.notEqual(String(data.pricingVerificationStatus || '').toUpperCase(), 'VERIFIED', 'rejected pricing payload must not be stored as verified');
}

for (const [label, strategy, pricing] of [
  ['fractional verified unit count', 'maintenance', { units: 12.5 }],
  ['fractional verified lift count', 'maintenance', { lifts: 1.5 }],
  ['fractional verified floor count', 'both', { floors: 4.25 }],
  ['sub-fils verified Maintenance rate', 'maintenance', { verifiedMaintenanceRate: 2000.555 }],
  ['sub-fils verified annual rent', 'pm_only', { annualRent: 600000.005 }],
]) {
  test(`Admin inspection pricing rejects a ${label}`, async () => {
    const { intakeId, inspectionId } = await inspectionFor(strategy);
    await expectHttpsError(evidence(intakeId, inspectionId, pricing), 'invalid-argument');
    await assertNoEvidenceStored(inspectionId);
  });
}

test('Admin inspection pricing accepts whole counts and exact-fils AED values unchanged', async () => {
  const { intakeId, inspectionId } = await inspectionFor('both');
  await evidence(intakeId, inspectionId, { units: 12, lifts: 2, verifiedMaintenanceRate: 2000.55, annualRent: 600000.05 });
  const data = (await db.doc(`property_inspections/${inspectionId}`).get()).data() || {};
  assert.equal(String(data.pricingVerificationStatus).toUpperCase(), 'VERIFIED');
  assert.equal(data.pricingVerification.units, 12);
  assert.equal(data.pricingVerification.lifts, 2);
  assert.equal(data.pricingVerification.verifiedMaintenanceRate, 2000.55);
  assert.equal(data.pricingVerification.annualRent, 600000.05);
});

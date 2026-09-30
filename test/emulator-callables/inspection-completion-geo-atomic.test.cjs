'use strict';
// Regression: adminCompleteOwnerPortfolioInspections (functions/canonicalOwnerInspectionCompletion.ts)
// ran the legacy completion runner, which commits the completed inspections, final quote, contract
// and payment state, and only then built the canonical property geo in a second batch. When the geo
// could not be built (no city/area on the property, or invalid arrival coordinates) the callable
// threw but the portfolio was left half completed: inspections COMPLETED and the contract repriced,
// while the property geo stayed unverified. Geo must be validated before anything is committed.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminCompleteOwnerPortfolioInspections } = lib('runtimeAll.js');

const WORKFLOW = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';
const OWNER = 'owner_geo_atomic';
const HASH = 'e'.repeat(64);
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const VERIFICATION = {
  floors: 4, lifts: 1, hvacCount: 12, hvac: true, districtCooling: false, fireAlarm: true, firePump: false,
  sira: true, gen: false, bmu: false, tank: true, pool: false, verifiedMaintenanceRate: 2000.55,
  annualRent: 600000.25, verifiedManagementRate: 5,
};

let adminMfa;
test.before(async () => {
  adminMfa = await createUser('admin_geo_atomic', { role: 'admin', admin: true }, { tokenExtra: MFA });
});
test.beforeEach(clearFirestore);

async function seed(intakeId, { city = 'Dubai', area = 'Dubai Marina', arrival = {} } = {}) {
  const propertyId = `${intakeId}_property_1`;
  const property = {
    id: propertyId, propertyId, ownerUid: OWNER, ownerId: OWNER, intakeId,
    propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 12, age: 5, slaTier: 'standard', paymentPlan: 'annual',
    strategy: 'both', annualRent: 600000.25, address: 'Geo Tower, Dubai Marina', city, area,
    geo: { lat: 25.08, lng: 55.14, address: 'Geo Tower, Dubai Marina', emirate: 'Dubai', city, area, verified: false, dispatchReady: false, requiresGeoReview: true },
  };
  await db.doc(`intake_submissions/${intakeId}`).set({
    workflowVersion: WORKFLOW, ownerUid: OWNER, ownerId: OWNER, status: 'SUBMITTED_FOR_PROPERTY_INSPECTION',
    properties: [property], inspectionIds: [`insp_${intakeId}`], selectedAddOns: [], quoteHash: HASH,
  });
  await db.doc(`contracts/${intakeId}`).set({
    workflowVersion: WORKFLOW, ownerUid: OWNER, ownerId: OWNER, intakeId, status: 'SIGNED', ownerSigned: true,
    signatureName: 'Owner Geo', otpVerificationId: 'otp_pre', quoteHash: HASH, signatureState: { ownerSigned: true },
  });
  await db.doc(`payment_transactions/${intakeId}`).set({
    workflowVersion: WORKFLOW, ownerUid: OWNER, ownerId: OWNER, intakeId, contractId: intakeId,
    status: 'NOT_DUE_UNTIL_INSPECTION_COMPLETE', paymentStatus: 'NOT_DUE_UNTIL_INSPECTION_COMPLETE',
  });
  await db.doc(`properties/${propertyId}`).set({ ...property, status: 'PENDING_PROPERTY_INSPECTION' });
  await db.doc(`property_inspections/insp_${intakeId}`).set({
    id: `insp_${intakeId}`, workflowVersion: WORKFLOW, intakeId, propertyId, ownerUid: OWNER,
    status: 'EVIDENCE_RECORDED_PENDING_COMPLETION', evidenceStatus: 'VERIFIED', evidenceHash: 'd'.repeat(64), evidenceGeneration: '1',
    evidenceRecordedBy: 'admin_geo_atomic', checklistVerified: true,
    arrivalLocation: { withinRadius: true, lat: 25.0801, lng: 55.1401, expectedLat: 25.08, expectedLng: 55.14, distanceMetres: 15, accuracyMeters: 8, capturedAtMs: Date.now(), ...arrival },
    visitStartedAt: admin.firestore.Timestamp.now(), visitCompletedAt: admin.firestore.Timestamp.now(),
    pricingDriver: 'unit', pricingClass: 'apt-std', propertyType: 'Apartment', pricingVerificationStatus: 'VERIFIED',
    pricingVerification: { units: 12, emirate: 'Dubai', zone: 'B', propertyAge: 5, slaTier: 'standard', paymentPlan: 'annual', ratesVerified: true, ...VERIFICATION },
  });
  return propertyId;
}

async function snapshotState(intakeId, propertyId) {
  const [intake, contract, payment, inspection, property, audits] = await Promise.all([
    db.doc(`intake_submissions/${intakeId}`).get(),
    db.doc(`contracts/${intakeId}`).get(),
    db.doc(`payment_transactions/${intakeId}`).get(),
    db.doc(`property_inspections/insp_${intakeId}`).get(),
    db.doc(`properties/${propertyId}`).get(),
    db.collection('audit_logs').get(),
  ]);
  return {
    intake: intake.data(), contract: contract.data(), payment: payment.data(), inspection: inspection.data(),
    property: property.data(), auditCount: audits.size,
  };
}

const FAILURES = [
  { name: 'a property with neither city nor area', seed: { city: '', area: '' }, message: /city or area/ },
  { name: 'invalid physical arrival coordinates', seed: { arrival: { lat: 999, lng: 55.1401 } }, message: /arrival coordinates are invalid/ },
];

for (const failure of FAILURES) {
  test(`completion with ${failure.name} fails before anything is committed`, async () => {
    const intakeId = `intake_geo_${failure.name.replace(/\W+/g, '_')}`;
    const propertyId = await seed(intakeId, failure.seed);
    const before = await snapshotState(intakeId, propertyId);

    const error = await expectHttpsError(
      call(adminCompleteOwnerPortfolioInspections, adminMfa, { intakeId, notes: 'All site visits completed and verified.' }),
      'failed-precondition',
    );
    assert.match(error.message, failure.message);

    const after = await snapshotState(intakeId, propertyId);
    assert.deepEqual(after, before, 'a failed completion must not leave a partially completed portfolio');
  });
}

test('the same portfolio completes and promotes geo once the address evidence is valid', async () => {
  const intakeId = 'intake_geo_valid';
  const propertyId = await seed(intakeId);
  const result = await call(adminCompleteOwnerPortfolioInspections, adminMfa, { intakeId, notes: 'All site visits completed and verified.' });
  assert.equal(result.geoVerifiedPropertyCount, 1);
  const { inspection, property } = await snapshotState(intakeId, propertyId);
  assert.equal(inspection.status, 'COMPLETED');
  assert.equal(property.dispatchReady, true);
  assert.equal(property.geo.city, 'Dubai');
});

test('a non-Admin caller is rejected before the geo preflight reports anything', async () => {
  const intakeId = 'intake_geo_non_admin';
  await seed(intakeId, { city: '', area: '' });
  const owner = await createUser('owner_geo_probe', { role: 'owner' });
  await expectHttpsError(call(adminCompleteOwnerPortfolioInspections, owner, { intakeId, notes: 'All site visits completed and verified.' }), 'permission-denied');
});

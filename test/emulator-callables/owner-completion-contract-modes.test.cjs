'use strict';
// Regression: Admin portfolio inspection completion must work for every contract mode the Owner UI
// offers (src/components/onboarding/CommercialTermsStep.tsx: FM_ONLY, PM_ONLY, BOTH).
// Before the fix a PM_ONLY property failed with `Cannot use "undefined" as a Firestore value
// (found in field "properties.0.floors")` because FM-only building-system fields were copied
// from the verification payload even when Facility Management was out of scope.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call } = require('./_setup.cjs');

const { adminCompleteOwnerPortfolioInspections } = lib('runtimeAll.js');
const { calculateOwnerOnboardingQuote } = lib('ownerOnboardingQuote.js');

const WORKFLOW = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';
const OWNER = 'owner_modes';
const HASH = 'e'.repeat(64);
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const FM_FIELDS = ['floors', 'lifts', 'hvacCount', 'hvac', 'districtCooling', 'fireAlarm', 'firePump', 'sira', 'gen', 'bmu', 'tank', 'pool'];
const fils = (value) => Math.round(value * 100);

let adminMfa;
test.before(async () => {
  adminMfa = await createUser('admin_modes_mfa', { role: 'admin', admin: true }, { tokenExtra: MFA });
});
test.beforeEach(clearFirestore);

const FM_VERIFICATION = {
  floors: 4, lifts: 1, hvacCount: 12, hvac: true, districtCooling: false, fireAlarm: true, firePump: false,
  sira: true, gen: false, bmu: false, tank: true, pool: false, verifiedMaintenanceRate: 2000.55,
};
const PM_VERIFICATION = { annualRent: 600000.25, verifiedManagementRate: 5 };

// The Owner's declared snapshot deliberately carries no FM building-system fields (as a PM_ONLY
// application from the five-page flow does not collect them).
function declaredProperty(intakeId, strategy) {
  return {
    id: `${intakeId}_property_1`, propertyId: `${intakeId}_property_1`, ownerUid: OWNER, ownerId: OWNER, intakeId,
    propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 12, age: 5, slaTier: 'standard', paymentPlan: 'annual',
    strategy, annualRent: 600000.25, address: 'Mode Tower, Dubai Marina', city: 'Dubai', area: 'Dubai Marina',
    geo: { lat: 25.08, lng: 55.14, address: 'Mode Tower, Dubai Marina', emirate: 'Dubai', city: 'Dubai', area: 'Dubai Marina', verified: false, dispatchReady: false, requiresGeoReview: true },
  };
}

async function seedInspected(intakeId, strategy, pricingVerification) {
  const property = declaredProperty(intakeId, strategy);
  await db.doc(`intake_submissions/${intakeId}`).set({
    workflowVersion: WORKFLOW, ownerUid: OWNER, ownerId: OWNER, status: 'SUBMITTED_FOR_PROPERTY_INSPECTION',
    properties: [property], inspectionIds: [`insp_${intakeId}`], selectedAddOns: [], quoteHash: HASH,
  });
  await db.doc(`contracts/${intakeId}`).set({
    workflowVersion: WORKFLOW, ownerUid: OWNER, ownerId: OWNER, intakeId, status: 'SIGNED', ownerSigned: true,
    signatureName: 'Owner Modes', otpVerificationId: 'otp_pre', quoteHash: HASH, signatureState: { ownerSigned: true },
  });
  await db.doc(`payment_transactions/${intakeId}`).set({
    workflowVersion: WORKFLOW, ownerUid: OWNER, ownerId: OWNER, intakeId, contractId: intakeId,
    status: 'NOT_DUE_UNTIL_INSPECTION_COMPLETE', paymentStatus: 'NOT_DUE_UNTIL_INSPECTION_COMPLETE',
  });
  await db.doc(`properties/${property.propertyId}`).set({ ...property, status: 'PENDING_PROPERTY_INSPECTION' });
  await db.doc(`property_inspections/insp_${intakeId}`).set({
    id: `insp_${intakeId}`, workflowVersion: WORKFLOW, intakeId, propertyId: property.propertyId, ownerUid: OWNER,
    status: 'EVIDENCE_RECORDED_PENDING_COMPLETION', evidenceStatus: 'VERIFIED', evidenceHash: 'd'.repeat(64), evidenceGeneration: '1',
    evidenceRecordedBy: 'admin_modes_mfa', checklistVerified: true,
    arrivalLocation: { withinRadius: true, lat: 25.0801, lng: 55.1401, expectedLat: 25.08, expectedLng: 55.14, distanceMetres: 15, accuracyMeters: 8, capturedAtMs: Date.now() },
    visitStartedAt: admin.firestore.Timestamp.now(), visitCompletedAt: admin.firestore.Timestamp.now(),
    pricingDriver: 'unit', pricingClass: 'apt-std', propertyType: 'Apartment', pricingVerificationStatus: 'VERIFIED',
    pricingVerification: {
      units: 12, emirate: 'Dubai', zone: 'B', propertyAge: 5, slaTier: 'standard', paymentPlan: 'annual', ratesVerified: true,
      ...pricingVerification,
    },
  });
  return property;
}

function expectedQuote(property, strategy, pricingVerification) {
  const verified = { ...property, strategy, ratesVerified: true, ...pricingVerification };
  return calculateOwnerOnboardingQuote([verified], [], Date.now(), { trustServerVerifiedRates: true });
}

const CASES = [
  { strategy: 'fm_only', verification: FM_VERIFICATION, fm: true, pm: false },
  { strategy: 'pm_only', verification: PM_VERIFICATION, fm: false, pm: true },
  { strategy: 'both', verification: { ...FM_VERIFICATION, ...PM_VERIFICATION }, fm: true, pm: true },
];

for (const { strategy, verification, fm, pm } of CASES) {
  test(`${strategy.toUpperCase()} portfolio completion issues an exact-fils final verified quote`, async () => {
    const intakeId = `intake_${strategy}`;
    const property = await seedInspected(intakeId, strategy, verification);
    const result = await call(adminCompleteOwnerPortfolioInspections, adminMfa, { intakeId, notes: 'All site visits completed and verified.' });
    assert.equal(result.geoVerifiedPropertyCount, 1);

    const [payment, contract, intake, propertyDoc] = await Promise.all([
      db.doc(`payment_transactions/${intakeId}`).get(),
      db.doc(`contracts/${intakeId}`).get(),
      db.doc(`intake_submissions/${intakeId}`).get(),
      db.doc(`properties/${property.propertyId}`).get(),
    ]);
    const pay = payment.data();
    const expected = expectedQuote(property, strategy, verification);
    assert.ok(expected.annualContractValue > 0, 'oracle quote must be positive');
    assert.equal(pay.annualContractValue, expected.annualContractValue);
    assert.equal(pay.activationDeposit, expected.activationDeposit);
    assert.equal(pay.amount, expected.activationDeposit);
    assert.equal(contract.data().depositAmount, expected.activationDeposit);
    assert.ok(Number.isInteger(fils(pay.annualContractValue)) && fils(pay.annualContractValue) / 100 === pay.annualContractValue, 'ACV must be whole fils');
    assert.ok(fils(pay.activationDeposit) / 100 === pay.activationDeposit, 'deposit must be whole fils');
    assert.equal(fils(pay.activationDeposit), Math.round(fils(pay.annualContractValue) * 0.15), 'deposit is 15% of ACV to the fils');
    assert.equal(pay.status, 'NOT_DUE_UNTIL_OWNER_FINAL_SIGNATURE');
    assert.equal(contract.data().status, 'PENDING_OWNER_SIGNATURE');

    const snapshot = intake.data().properties[0];
    const stored = propertyDoc.data();
    for (const record of [snapshot, stored]) {
      assert.equal(record.ratesVerified, true);
      if (fm) {
        assert.equal(record.verifiedMaintenanceRate, verification.verifiedMaintenanceRate);
        for (const key of FM_FIELDS) assert.equal(record[key], verification[key], `${key} must be the Admin-verified value`);
      } else {
        assert.equal('verifiedMaintenanceRate' in record, false);
        for (const key of FM_FIELDS) assert.equal(key in record, false, `${key} must not be invented for ${strategy}`);
      }
      if (pm) {
        assert.equal(record.verifiedManagementRate, verification.verifiedManagementRate);
        assert.equal(record.annualRent, verification.annualRent);
      } else {
        assert.equal('verifiedManagementRate' in record, false);
      }
    }
    assert.equal(stored.dispatchReady, true);
  });
}

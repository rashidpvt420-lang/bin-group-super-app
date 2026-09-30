'use strict';
// Regression: previewOwnerInspectionQuote (and the inspection-first submission that re-prices the
// portfolio) let pricing validation errors escape as plain Errors. firebase-functions turns any
// non-HttpsError into { status: "INTERNAL", message: "INTERNAL" }, so an Owner with, for example,
// a Property Management quote and no annual rent saw only "INTERNAL" instead of the reason.
// Pricing validation must surface as invalid-argument with the calculator's message.
const assert = require('node:assert/strict');
const test = require('node:test');
const { lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { previewOwnerInspectionQuote } = lib('inspectionFirstOwnerOnboarding.js');
const { submitOwnerInspectionFirstOnboarding } = lib('canonicalOwnerSubmission.js');

let owner;
test.before(async () => { owner = await createUser('owner_qerr', { role: 'owner' }); });
test.beforeEach(clearFirestore);

const BASE = {
  id: 'draft_1', propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 2, age: 3, slaTier: 'standard', paymentPlan: 'annual',
  address: 'Q Tower, Dubai Marina', geo: { lat: 25.08, lng: 55.14, address: 'Q Tower, Dubai Marina', source: 'device_gps' },
};

for (const [label, property, pattern] of [
  ['Property Management without annual rent', { ...BASE, strategy: 'pm_only', annualRent: 0 }, /annual rent/i],
  ['an unsupported property type', { ...BASE, strategy: 'maintenance', propertyType: 'Spaceport' }, /Unsupported property type/],
  ['a negative unit count', { ...BASE, strategy: 'maintenance', units: -2 }, /negative/],
  ['a missing contract mode', { ...BASE }, /contract mode/i],
]) {
  test(`preview quote reports ${label} as invalid-argument with the reason`, async () => {
    const error = await expectHttpsError(call(previewOwnerInspectionQuote, owner, { properties: [property], selectedAddOns: [] }), 'invalid-argument');
    assert.match(error.message, pattern);
  });
}

test('mixed contract modes are reported as invalid-argument', async () => {
  const error = await expectHttpsError(call(previewOwnerInspectionQuote, owner, {
    properties: [{ ...BASE, strategy: 'maintenance' }, { ...BASE, id: 'draft_2', strategy: 'pm_only', annualRent: 100000 }], selectedAddOns: [],
  }), 'invalid-argument');
  assert.match(error.message, /same contract mode/);
});

test('submission re-pricing reports an unpriceable portfolio as invalid-argument', async () => {
  const error = await expectHttpsError(call(submitOwnerInspectionFirstOnboarding, owner, {
    intakeId: require('node:crypto').randomUUID(), ownerUid: owner.uid, ownerEmail: owner.token.email, properties: [{ ...BASE, strategy: 'pm_only', annualRent: 0 }],
    selectedAddOns: [], quoteHash: 'a'.repeat(64), quoteQuotedAtMs: Date.now() - 1000, signatureName: 'Q Owner', otpVerificationId: 'otp_missing',
  }), 'invalid-argument');
  assert.match(error.message, /annual rent/i);
});

test('a priceable portfolio still returns the server quote', async () => {
  const quote = await call(previewOwnerInspectionQuote, owner, { properties: [{ ...BASE, strategy: 'maintenance' }], selectedAddOns: [] });
  assert.match(quote.quoteHash, /^[a-f0-9]{64}$/);
  assert.ok(quote.annualContractValue > 0 && quote.activationDeposit > 0);
});

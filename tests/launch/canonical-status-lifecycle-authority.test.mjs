import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (relPath) => readFile(new URL(`../../${relPath}`, import.meta.url), 'utf8');

test('inspectionFirstOwnerOnboarding writes canonical uppercase status values and no lowercase aliases', async () => {
  const source = await read('functions/inspectionFirstOwnerOnboarding.ts');

  // Verify canonical uppercase writes
  assert.match(source, /status:\s*"SUBMITTED_FOR_PROPERTY_INSPECTION"/, 'Intake status must be SUBMITTED_FOR_PROPERTY_INSPECTION');
  assert.match(source, /status:\s*"PENDING_PROPERTY_INSPECTION"/, 'Property status must be PENDING_PROPERTY_INSPECTION');
  assert.match(source, /inspectionStatus:\s*"PENDING_ADMIN_SITE_VISIT"/, 'Inspection status must be PENDING_ADMIN_SITE_VISIT');
  assert.match(source, /activationStatus:\s*"LOCKED_PENDING_INSPECTION_AND_PAYMENT"/, 'Activation status must be locked pending inspection and payment');
  assert.match(source, /status:\s*"AWAITING_15_PERCENT_PAYMENT"/, 'Quote status must be AWAITING_15_PERCENT_PAYMENT');

  // Ensure lowercase status aliases are NOT written for property lifecycle
  assert.doesNotMatch(source, /status:\s*"submitted"/, 'Lowercase "submitted" must not be written as property status');
  assert.doesNotMatch(source, /status:\s*"under_review"/, 'Lowercase "under_review" must not be written as property status');
  assert.doesNotMatch(source, /status:\s*"changes_requested"/, 'Lowercase "changes_requested" must not be written as property status');
});

test('ownerInspectionAdminLink writes canonical READY_FOR_SITE_VISIT status', async () => {
  const source = await read('functions/ownerInspectionAdminLink.ts');

  assert.match(source, /status:\s*"READY_FOR_SITE_VISIT"/, 'Inspection entity status must be READY_FOR_SITE_VISIT');
  assert.match(source, /inspectionStatus:\s*"READY_FOR_SITE_VISITS"/, 'Intake inspectionStatus must be READY_FOR_SITE_VISITS');
  assert.doesNotMatch(source, /status:\s*"ready_for_site_visit"/, 'Lowercase ready_for_site_visit must not be written');
});

test('ownerInspectionCompletion writes canonical quote and onboarding states', async () => {
  const source = await read('functions/ownerInspectionCompletion.ts');

  assert.match(source, /status:\s*"AWAITING_15_PERCENT_PAYMENT"/, 'Quote status must be AWAITING_15_PERCENT_PAYMENT');
  assert.match(source, /onboardingStatus:\s*"FINAL_QUOTE_VERIFIED_AWAITING_15_PERCENT_PAYMENT"/, 'Owner onboardingStatus must be uppercase canonical');
  assert.doesNotMatch(source, /status:\s*"awaiting_15_percent_payment"/, 'Lowercase awaiting_15_percent_payment must not be written');
});

test('canonical runtime contract document mandates uppercase status conventions', async () => {
  const contract = await read('docs/CANONICAL_RUNTIME_CONTRACT.md');

  assert.match(contract, /SUBMITTED_FOR_PROPERTY_INSPECTION/);
  assert.match(contract, /PENDING_PROPERTY_INSPECTION/);
  assert.match(contract, /READY_FOR_SITE_VISIT/);
  assert.match(contract, /AWAITING_15_PERCENT_PAYMENT/);
  assert.match(contract, /ACTIVE/);
  assert.match(contract, /New inspection-first writes use uppercase underscore-delimited status values/);
  assert.match(contract, /Legacy aliases may be normalized only at controlled compatibility read boundaries/);
});

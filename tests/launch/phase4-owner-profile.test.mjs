import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Phase 4 Owner journey exposes every operational surface', async () => {
  const [ownerApp, app, properties] = await Promise.all([
    read('src/owner/OwnerApp.tsx'),
    read('src/App.tsx'),
    read('src/owner/pages/OwnerPropertiesPage.tsx'),
  ]);

  assert.match(app, /path=["']\/onboarding\/\*["']/);
  for (const route of [
    '/profile',
    '/properties',
    '/contracts',
    '/payment-proof',
    '/units',
    '/tenants',
    '/inspections',
    '/tickets',
    '/financials',
    '/p-l-report',
  ]) {
    assert.ok(ownerApp.includes(`path="${route}"`) || ownerApp.includes(`path='${route}'`), `Missing Owner route ${route}`);
  }
  assert.match(properties, /where\('ownerId',\s*'==',\s*user\.uid\)/);
  assert.doesNotMatch(properties, /where\('ownerEmail',\s*'=='/);
  assert.match(properties, /data-testid="owner-register-property"/);
  assert.match(properties, /navigate\('\/onboarding'\)/);
  assert.match(properties, /prop\.status\?\.toUpperCase\(\) \|\| 'PENDING'/);
});

test('Owner submitted geo stays untrusted and cannot become canonical client authority', async () => {
  const [rules, locationStep, resubmission] = await Promise.all([
    read('firestore.rules'),
    read('src/components/onboarding/PropertyLocationStep.tsx'),
    read('functions/ownerPropertyResubmission.ts'),
  ]);

  assert.match(locationStep, /verified:\s*false/);
  assert.match(locationStep, /dispatchReady:\s*false/);
  assert.match(locationStep, /requiresGeoReview:\s*true/);
  assert.match(rules, /data\.submittedGeo\.get\('source', ''\) == 'owner_submission'/);
  assert.match(rules, /data\.submittedGeo\.get\('verified', false\) == false/);
  assert.match(rules, /data\.submittedGeo\.get\('dispatchReady', false\) == false/);
  assert.match(rules, /function propertyOwnedByCaller\(data\)/);
  assert.match(rules, /data\.get\('ownerId', null\) == request\.auth\.uid/);
  assert.match(rules, /data\.get\('ownerUid', null\) == request\.auth\.uid/);
  assert.match(rules, /'active',[\s\S]*'isActive',[\s\S]*'inspectionVerified'/);
  assert.match(resubmission, /source:\s*"owner_submission"/);
  assert.match(resubmission, /verified:\s*false/);
  assert.match(resubmission, /dispatchReady:\s*false/);
  assert.match(resubmission, /requiresGeoReview:\s*true/);
});

test('inspection, approval and payment cannot bypass physical evidence before activation', async () => {
  const [submission, adminReview, paymentApproval] = await Promise.all([
    read('functions/inspectionFirstOwnerOnboarding.ts'),
    read('functions/adminPropertyReview.ts'),
    read('functions/securePaymentApproval.ts'),
  ]);

  assert.match(submission, /status:\s*"PENDING_PROPERTY_INSPECTION"/);
  assert.match(submission, /activationStatus:\s*"LOCKED_PENDING_INSPECTION_AND_PAYMENT"/);
  assert.match(submission, /paymentStatus:\s*"NOT_DUE_UNTIL_INSPECTION_COMPLETE"/);
  assert.match(submission, /unlocksDashboard:\s*false/);
  assert.match(adminReview, /Inspection-first properties cannot be approved or made dispatch-ready/);
  assert.match(paymentApproval, /payment\.inspectionVerified !== true/);
  assert.match(paymentApproval, /upper\(intake\.inspectionStatus\) !== "COMPLETED"/);
  assert.match(paymentApproval, /upper\(value\.evidenceStatus\) !== "VERIFIED"/);
  assert.match(paymentApproval, /value\.arrivalLocation\?\.withinRadius !== true/);
  assert.match(paymentApproval, /value\.checklistVerified !== true/);
});

test('duplicate property registration is server-authoritative and not name-only', async () => {
  const [wrapper, identity, rules] = await Promise.all([
    read('functions/canonicalOwnerSubmission.ts'),
    read('functions/propertyIdentity.ts'),
    read('firestore.rules'),
  ]);

  assert.match(wrapper, /collection\("property_identity_registry"\)/);
  assert.match(wrapper, /db\.runTransaction/);
  for (const identityKind of ['TITLE_DEED', 'PLACE_UNIT', 'ADDRESS_UNIT', 'GEO_UNIT']) {
    assert.ok(identity.includes(identityKind), `Missing duplicate identity ${identityKind}`);
  }
  assert.doesNotMatch(identity, /PROPERTY_NAME/);
  assert.match(rules, /match \/property_identity_registry\/\{identityHash\}/);
  assert.match(rules, /allow read, create, update, delete: if false/);
});

test('resubmitOwnerProperty is owner-bound and only performs changes_requested to admin_review', async () => {
  const [resubmission, runtime, stateMachine] = await Promise.all([
    read('functions/ownerPropertyResubmission.ts'),
    read('functions/runtime.ts'),
    read('functions/onboardingStateMachine.ts'),
  ]);

  assert.match(runtime, /export \{ resubmitOwnerProperty \} from "\.\/ownerPropertyResubmission"/);
  assert.match(resubmission, /enforceAppCheck:\s*true/);
  assert.match(resubmission, /This property belongs to another owner/);
  assert.match(resubmission, /propertyState !== "changes_requested"/);
  assert.match(resubmission, /intakeState !== "changes_requested"/);
  assert.match(resubmission, /assertOnboardingTransition\(propertyState, "admin_review"\)/);
  assert.match(resubmission, /assertOnboardingTransition\(intakeState, "admin_review"\)/);
  assert.match(resubmission, /status:\s*"admin_review"/);
  assert.match(resubmission, /lifecycleStatus:\s*"admin_review"/);
  assert.match(resubmission, /onboardingState:\s*"admin_review"/);
  assert.match(stateMachine, /changes_requested:\s*\[[^\]]*'admin_review'/);
  assert.doesNotMatch(resubmission, /"draft"\s*\|\|\s*"under_review"/i);
});

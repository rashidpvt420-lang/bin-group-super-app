import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Phase 4 Owner property onboarding remains inspection-first and owner-submitted geo stays untrusted', async () => {
  const [submission, canonical, authority, inspectionCompletion] = await Promise.all([
    read('functions/inspectionFirstOwnerOnboarding.ts'),
    read('functions/canonicalOwnerSubmission.ts'),
    read('functions/propertyGeoAuthority.ts'),
    read('functions/canonicalOwnerInspectionCompletion.ts'),
  ]);

  assert.match(submission, /OWNER_FIVE_PAGE_INSPECTION_FIRST_V1/);
  assert.match(submission, /status: "PENDING_PROPERTY_INSPECTION"/);
  assert.match(submission, /canonicalOnboardingState: "admin_review"/);
  assert.match(submission, /paymentStatus: "NOT_DUE_UNTIL_INSPECTION_COMPLETE"/);
  assert.match(submission, /activationStatus: "LOCKED_PENDING_INSPECTION_AND_PAYMENT"/);
  assert.match(submission, /verified: false/);
  assert.match(submission, /dispatchReady: false/);
  assert.match(submission, /requiresGeoReview: true/);

  assert.match(canonical, /buildPropertyIdentities/);
  assert.match(canonical, /property_identity_registry/);
  assert.match(canonical, /TITLE_DEED|PROPERTY_IDENTITY_VERSION/);
  assert.match(authority, /buildInspectionVerifiedPropertyGeo/);
  assert.match(inspectionCompletion, /buildInspectionVerifiedPropertyGeo/);
  assert.match(inspectionCompletion, /PROMOTE_PHYSICAL_INSPECTION_GPS_TO_CANONICAL_PROPERTY_GEO/);
});

test('Phase 4 duplicate detection is identity-based, not property-name-only', async () => {
  const [identity, canonical, resubmission] = await Promise.all([
    read('functions/propertyIdentity.ts'),
    read('functions/canonicalOwnerSubmission.ts'),
    read('functions/ownerPropertyResubmission.ts'),
  ]);

  for (const marker of ['TITLE_DEED', 'PLACE_UNIT', 'ADDRESS_UNIT', 'GEO_UNIT']) {
    assert.match(identity, new RegExp(marker));
  }
  assert.match(canonical, /assertNoExistingCanonicalProperty/);
  assert.match(canonical, /claimPropertyIdentities/);
  assert.match(canonical, /already-exists/);
  assert.doesNotMatch(canonical, /propertyName[^\n]{0,80}already-exists/i);

  assert.match(resubmission, /buildPropertyIdentities/);
  assert.match(resubmission, /property_identity_registry/);
  assert.match(resubmission, /requestedKeys/);
  assert.match(resubmission, /already-exists/);
});

test('Phase 4 resubmitOwnerProperty is owner-bound and CHANGES_REQUESTED-only', async () => {
  const [source, runtime, stateMachine] = await Promise.all([
    read('functions/ownerPropertyResubmission.ts'),
    read('functions/runtime.ts'),
    read('functions/onboardingStateMachine.ts'),
  ]);

  assert.match(runtime, /export \* from "\.\/ownerPropertyResubmission"/);
  assert.match(source, /export const resubmitOwnerProperty = onCall/);
  assert.match(source, /enforceAppCheck: true/);
  assert.match(source, /Only the owning Owner can resubmit this property/);
  assert.match(source, /Only the owning Owner can resubmit this intake/);
  assert.match(source, /!== "changes_requested"/);
  assert.match(source, /assertOnboardingTransition\("changes_requested", "admin_review"\)/);
  assert.match(source, /canonicalOnboardingState: "admin_review"/);
  assert.match(stateMachine, /admin_review: \['changes_requested'/);
  assert.match(stateMachine, /changes_requested: \[[^\]]*'admin_review'/);
});

test('Phase 4 Owner resubmission cannot certify GPS, activate, or bypass inspection/payment', async () => {
  const source = await read('functions/ownerPropertyResubmission.ts');

  assert.match(source, /source: "owner_submission"/);
  assert.match(source, /quality: "OWNER_SUBMITTED_REVIEW_REQUIRED"/);
  assert.match(source, /verified: false/);
  assert.match(source, /dispatchReady: false/);
  assert.match(source, /requiresGeoReview: true/);
  assert.match(source, /verifiedBy: null/);
  assert.match(source, /verifiedAt: null/);
  assert.match(source, /status: "PENDING_PROPERTY_INSPECTION"/);
  assert.match(source, /inspectionStatus: "PENDING_ADMIN_SITE_VISIT"/);
  assert.match(source, /paymentStatus: "NOT_DUE_UNTIL_INSPECTION_COMPLETE"/);
  assert.match(source, /dashboardLocked: true/);
  assert.match(source, /dashboardUnlocked: false/);
  assert.doesNotMatch(source, /status: "ACTIVE"/);
});

test('Phase 4 Founder change request cannot replace physical inspection approval', async () => {
  const [changes, legacyReview] = await Promise.all([
    read('functions/ownerPropertyResubmission.ts'),
    read('functions/adminPropertyReview.ts'),
  ]);

  assert.match(changes, /export const adminRequestOwnerPropertyChanges = onCall/);
  assert.match(changes, /assertPreInspectionCorrectionState/);
  assert.match(changes, /site inspections are linked/);
  assert.match(changes, /A site inspection already exists/);
  assert.match(changes, /status: "CHANGES_REQUESTED"/);
  assert.match(changes, /paymentStatus: "NOT_DUE_UNTIL_INSPECTION_COMPLETE"/);
  assert.match(changes, /activationState: "LOCKED_PENDING_OWNER_CORRECTIONS"/);

  assert.match(legacyReview, /OWNER_FIVE_PAGE_INSPECTION_FIRST_V1/);
  assert.match(legacyReview, /Inspection-first properties cannot be approved or made dispatch-ready/);
});

test('Phase 4 payment approval cannot activate before verified physical evidence and dispatch-ready geo', async () => {
  const [secureApproval, legacyApproval] = await Promise.all([
    read('functions/securePaymentApproval.ts'),
    read('functions/paymentTransactionApproval.ts'),
  ]);

  assert.match(secureApproval, /OWNER_FIVE_PAGE_INSPECTION_FIRST_V1/);
  assert.match(secureApproval, /payment\.inspectionVerified !== true/);
  assert.match(secureApproval, /All portfolio inspections must be completed and linked before final approval/);
  assert.match(secureApproval, /evidenceStatus/);
  assert.match(secureApproval, /arrivalLocation\?\.withinRadius/);
  assert.match(secureApproval, /isPropertyLocationActivationReady/);
  assert.match(secureApproval, /Owner activation is blocked until every property location is verified and dispatch-ready/);

  const activationIndex = legacyApproval.indexOf('status: "ACTIVE"');
  assert.ok(activationIndex > 0, 'activation code must exist only behind the secure wrapper gate');
});

test('Phase 4 Firestore browser rules reserve property lifecycle authority for the server', async () => {
  const rules = await read('firestore.rules');

  assert.match(rules, /Canonical property creation and Owner corrections are server-authoritative/);
  assert.match(rules, /allow create: if isNotSuspended\(\) &&\s*canManageProperties\(\)/);
  assert.match(rules, /propertyCreateHasNoActivationAuthority/);
  assert.match(rules, /propertyActivationAuthorityUnchanged/);
  assert.match(rules, /'inspectionVerified'/);
  assert.match(rules, /'adminSiteVisitVerified'/);
  assert.match(rules, /'locationVerified'/);

  const propertyBlock = rules.slice(
    rules.indexOf('match /properties/{propertyId}'),
    rules.indexOf('match /units/{unitId}'),
  );
  assert.doesNotMatch(propertyBlock, /ownerDraftCreate\(/);
  assert.doesNotMatch(propertyBlock, /safeOwnerPropertyUpdate\(/);
});

test('Phase 4 Owner UI exposes registration and correction before activation but keeps operations gated', async () => {
  const [ownerApp, propertiesPage, correctionPage, activationPolicy, adminReview] = await Promise.all([
    read('src/owner/OwnerApp.tsx'),
    read('src/owner/pages/OwnerPropertiesPage.tsx'),
    read('src/owner/pages/OwnerPropertyCorrectionPage.tsx'),
    read('src/owner/activationPolicy.ts'),
    read('apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx'),
  ]);

  assert.match(ownerApp, /\/properties\/:propertyId\/correct/);
  assert.match(propertiesPage, /owner-register-new-asset/);
  assert.match(propertiesPage, /navigate\('\/onboarding'\)/);
  assert.match(propertiesPage, /Correct & Resubmit/);
  assert.match(correctionPage, /httpsCallable\(functions, 'resubmitOwnerProperty'\)/);
  assert.doesNotMatch(correctionPage, /updateDoc\s*\(/);
  assert.doesNotMatch(correctionPage, /setDoc\s*\(/);

  for (const route of ['/owner/profile', '/owner/properties', '/owner/inspections', '/owner/review-queue']) {
    assert.match(activationPolicy, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.match(activationPolicy, /properties\\\/\[\^\/\]\+\\\/correct/);

  assert.match(adminReview, /adminRequestOwnerPropertyChanges/);
  assert.match(adminReview, /Request pre-inspection changes/);
  assert.doesNotMatch(adminReview, /inspectionFirst\(row\)[\s\S]{0,500}adminReviewOwnerProperty/);
});

test('Phase 4 Owner operational surfaces remain present after activation', async () => {
  const ownerApp = await read('src/owner/OwnerApp.tsx');

  for (const route of [
    '/units',
    '/tenants',
    '/tickets',
    '/financials',
    '/p-l-report',
    '/property-passport',
    '/documents',
    '/renewals',
    '/inspections',
  ]) {
    assert.match(ownerApp, new RegExp(`path="${route.replaceAll('/', '\\/')}`));
  }
});

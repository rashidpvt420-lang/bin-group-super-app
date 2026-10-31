import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync('functions/adminOwnerApplicationDecision.ts', 'utf8');
test('admin request-changes / reject callable is gated, reasoned, lifecycle-enforced and exported', () => {
  assert.match(src, /enforceAppCheck: true/);
  assert.match(src, /requirePrivilegedMfaSession\(request\.auth\)/);
  assert.match(src, /reason\.length < 8/);
  assert.match(src, /assertOwnerOnboardingTransition\(from, target\.lifecycle, "admin"\)/);
  assert.match(src, /assertCanonicalTransition\("property"/);
  assert.match(src, /OWNER_APPLICATION_CHANGES_REQUESTED/);
  assert.match(src, /OWNER_APPLICATION_REJECTED/);
  assert.match(src, /ownerResubmissionAllowed: false/);
  assert.match(src, /runTransaction/);
  assert.match(readFileSync('functions/runtime.ts', 'utf8'), /adminOwnerApplicationDecision/);
  assert.doesNotMatch(readFileSync('functions/ownerOnboardingLifecycle.ts', 'utf8'), /not implemented yet/);
});
test('owner resubmission stays owner-only from CHANGES_REQUESTED and REJECTED is terminal', () => {
  const lc = readFileSync('functions/ownerOnboardingLifecycle.ts', 'utf8');
  assert.match(lc, /CHANGES_REQUESTED: \[\s*\{ to: "CHANGES_REQUESTED", actors: OWNER \},\s*\{ to: "SUBMITTED_FOR_PROPERTY_INSPECTION", actors: OWNER \},/);
  assert.match(lc, /REJECTED: \[\],/);
  const resub = readFileSync('functions/ownerPropertyResubmission.ts', 'utf8');
  assert.match(resub, /intakeState !== "changes_requested"/);
});

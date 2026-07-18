import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Owner full-name changes are bound to the verified KYC identity', async () => {
  const backend = await read('functions/secureOwnerProfileOperations.ts');
  assert.match(backend, /const displayNameChanged = compact\(displayName\)/);
  assert.match(backend, /sensitiveIdentityChanged = displayNameChanged \|\| companyNameChanged \|\| billingNameChanged/);
  assert.match(backend, /displayNameChanged && !allowed\.has\(compact\(displayName\)\)/);
  assert.match(backend, /Owner full name must match the verified Owner KYC identity/);
  assert.match(backend, /identityAuthority: "OWNER_KYC_RECORD"/);
  assert.match(backend, /admin\.auth\(\)\.updateUser\(uid, \{ displayName: value\.displayName \}\)/);
});

test('Technician profile edits are preference-only and App Check protected', async () => {
  const backend = await read('functions/secureTechnicianProfileOperations.ts');
  const page = await read('src/technician/pages/TechnicianProfilePage.tsx');
  const runtime = await read('functions/runtime.ts');

  assert.match(backend, /const ALLOWED_KEYS = new Set\(\[/);
  for (const field of ['serviceZonePreference', 'emergencyContact', 'language']) {
    assert.match(backend, new RegExp(`"${field}"`));
  }
  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /TECHNICIAN_PROFILE_PREFERENCES_UPDATED/);
  assert.match(backend, /authoritativeIdentityFieldsExcluded/);
  assert.doesNotMatch(backend, /transaction\.update\(userRef,[\s\S]{0,600}displayName:/);
  assert.doesNotMatch(backend, /transaction\.update\(userRef,[\s\S]{0,600}requestedTrade:/);

  assert.match(page, /httpsCallable\(functions, 'updateTechnicianProfilePreferences'\)/);
  assert.match(page, /technician-profile-authority-notice/);
  assert.match(page, /technician-authoritative-name/);
  assert.match(page, /technician-authoritative-phone/);
  assert.match(page, /technician-authoritative-trade/);
  assert.match(page, /InputProps=\{\{ readOnly: true \}\}/);
  assert.doesNotMatch(page, /\bsetDoc\s*\(/);
  assert.doesNotMatch(page, /\bupdateProfile\s*\(/);
  assert.doesNotMatch(page, /\bserverTimestamp\s*\(/);

  assert.match(runtime, /export \{ updateTechnicianProfilePreferences \} from "\.\/secureTechnicianProfileOperations";/);
});

test('canonical Firestore hardener protects reviewed profile fields for all customer roles', async () => {
  const hardener = await read('scripts/harden-final-firestore-authority.mjs');
  for (const role of ['tenant', 'owner', 'technician', 'broker']) {
    assert.match(hardener, new RegExp(`${role}: \\[`));
    assert.match(hardener, new RegExp(`claimedRole\\(\\) != '\\$\\{role\\}'|claimedRole\\(\\) != '\\$\\{role\\}'`));
  }
  assert.match(hardener, /hardenReviewedRoleSelfUpdates/);
  assert.match(hardener, /reviewed profile guard must exist exactly once/);
  assert.match(hardener, /reviewed profile authority for all five roles/);
});

test('behavioral rules suite denies direct reviewed profile writes while preserving language', async () => {
  const rulesTest = await read('test/five-profile-protected-fields-rules.test.js');
  for (const role of ['owner', 'tenant', 'technician', 'broker']) {
    assert.match(rulesTest, new RegExp(`role: '${role}'`));
  }
  assert.match(rulesTest, /keeps language self-service but cannot bypass reviewed profile authority/);
  assert.match(rulesTest, /Bypassed Owner Name/);
  assert.match(rulesTest, /Bypassed Technician Name/);
  assert.match(rulesTest, /FORGED-RERA/);
});

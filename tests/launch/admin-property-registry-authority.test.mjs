import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin Asset Registry is read-only and routes mutations to canonical Intake Vault', async () => {
  const [page, app, canonicalSubmission] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/PropertyManagementPage.tsx'),
    read('apps/admin-panel/src/App.tsx'),
    read('functions/canonicalOwnerSubmission.ts'),
  ]);

  assert.match(page, /READ-ONLY OPERATIONAL REGISTRY/);
  assert.match(page, /navigate\('\/vault'\)/);
  assert.doesNotMatch(page, /httpsCallable\(/);
  assert.doesNotMatch(page, /\baddDoc\s*\(/);
  assert.doesNotMatch(page, /\bupdateDoc\s*\(/);
  assert.doesNotMatch(page, /\bdeleteDoc\s*\(/);
  assert.doesNotMatch(page, /adminUpsertPropertyCandidate/);
  assert.doesNotMatch(page, /adminDeletePropertyCandidate/);
  assert.doesNotMatch(page, /Add Institutional Asset|Save Review Candidate|UPDATE ASSET DNA/);

  assert.match(app, /path="\/vault"/);
  assert.match(app, /<IntakeVaultPage \/>/);
  assert.match(canonicalSubmission, /property_identity_registry/);
  assert.match(canonicalSubmission, /assertNoExistingCanonicalProperty/);
  assert.match(canonicalSubmission, /submitOwnerInspectionFirstOnboarding = onCall/);
});

test('Asset Registry never presents submitted coordinates as verified canonical geo', async () => {
  const page = await read('apps/admin-panel/src/pages/admin/PropertyManagementPage.tsx');
  assert.match(page, /prop\.geo\?\.verified === true/);
  assert.match(page, /label="UNVERIFIED"/);
  assert.doesNotMatch(page, /submittedGeo\?\.verified\s*===\s*true/);
});

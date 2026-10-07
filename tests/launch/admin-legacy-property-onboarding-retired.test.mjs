import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('legacy Admin property onboarding is retired in favor of canonical Intake Vault', async () => {
  const [app, page, intake, canonicalSubmission] = await Promise.all([
    read('apps/admin-panel/src/App.tsx'),
    read('apps/admin-panel/src/pages/admin/PropertyOnboardingPage.tsx'),
    read('apps/admin-panel/src/pages/admin/IntakeVaultPage.tsx'),
    read('functions/canonicalOwnerSubmission.ts'),
  ]);

  assert.match(app, /<Route path="\/onboard-property" element=\{<Navigate to="\/vault" replace \/>\} \/>/);
  assert.doesNotMatch(app, /PropertyOnboardingPage/);

  assert.match(page, /<Navigate to="\/vault" replace \/>/);
  assert.doesNotMatch(page, /\baddDoc\s*\(/);
  assert.doesNotMatch(page, /\bupdateDoc\s*\(/);
  assert.doesNotMatch(page, /\bsetDoc\s*\(/);
  assert.doesNotMatch(page, /pending_tenants|collection\(db, 'properties'\)|collection\(db, 'units'\)/);

  assert.match(intake, /adminCreateOwnerPortfolioPropertyInspection/);
  assert.match(canonicalSubmission, /property_identity_registry/);
  assert.match(canonicalSubmission, /submitOwnerInspectionFirstOnboarding = onCall/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('merged main retains the Owner acquisition evidence runner and lifecycle mail runtime export', async () => {
  const [ownerSpec, runtime, evidenceRunner, financials] = await Promise.all([
    read('tests/e2e/business-owner.spec.ts'),
    read('functions/runtime.ts'),
    read('scripts/run-owner-onboarding-production-evidence.mjs'),
    read('src/owner/pages/OwnerFinancialsPage.tsx'),
  ]);

  assert.match(ownerSpec, /run-owner-business-suite-evidence\.mjs/);
  assert.match(ownerSpec, /owner-onboarding-production-evidence/);
  assert.match(runtime, /export \* from ["']\.\/ownerOnboardingLifecycleEmail["'];/);
  assert.match(evidenceRunner, /adminRejectPayment/);
  assert.match(evidenceRunner, /adminApprovePayment/);
  assert.match(evidenceRunner, /approvalIdempotentReplay:\s*true/);
  assert.match(financials, /ONBOARDING & SERVICE INVOICES/);
  assert.match(financials, /collection\(db, ['"]invoices['"]\)/);
});

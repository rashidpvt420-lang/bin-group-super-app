import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin payment evidence uses stable contracts instead of obsolete copy', () => {
  const page = read('apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx');
  const evidence = read('tests/e2e/business-admin.spec.ts');
  assert.match(page, /data-testid="admin-payment-approve"/);
  assert.match(page, /data-testid="admin-payment-approval-dialog"/);
  assert.match(page, /data-testid="admin-payment-confirm-approval"/);
  assert.match(evidence, /getByTestId\('admin-payment-approve'\)/);
  assert.match(evidence, /getByTestId\('admin-payment-approval-dialog'\)/);
  assert.match(evidence, /getByTestId\('admin-payment-confirm-approval'\)/);
  assert.doesNotMatch(evidence, /name:\s*\/Verify & Unlock\/i/);
  assert.doesNotMatch(evidence, /name:\s*\/Confirm Payment & Unlock Owner\/i/);
});

test('Recovery Tenant starts without an existing canonical Tenant session', () => {
  const source = read('tests/e2e/business-tenant.spec.ts');
  assert.match(source, /test\.beforeEach\(async \(\{ page \}, testInfo\)/);
  assert.match(source, /if \(!testInfo\.title\.startsWith\('Unassigned-residence fallback'\)\)/);
  assert.match(source, /await login\(page, 'tenant', RECOVERY_EMAIL, RECOVERY_PASSWORD\)/);
});

test('Recovery Tenant fixture cannot be blocked by the unrelated legal modal', () => {
  const source = read('tests/e2e/business-tenant.spec.ts');
  assert.match(source, /legalAcceptedAt:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(source, /getByTestId\('legal-agreement-content'\)\)\.toHaveCount\(0/);
});

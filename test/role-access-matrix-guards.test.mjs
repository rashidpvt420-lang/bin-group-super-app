import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('five-profile access matrix explicitly denies financial approvals to non-admin app profiles', () => {
  const matrix = read('docs/audits/ROLE_ACCESS_CONTROL_MATRIX_2026-11-03.md');
  for (const role of ['Owner', 'Tenant', 'Technician', 'Broker', 'Admin / Finance']) assert.ok(matrix.includes(role), 'missing role: ' + role);
  assert.match(matrix, /Owner, Tenant, Technician, and Broker accounts must never approve payments/i);
  assert.match(matrix, /Mandatory financial approval controls/i);
  assert.match(matrix, /Required negative tests/i);
});

test('payment approval decisions have server-side Admin/Finance gates', () => {
  const secureApproval = read('functions/securePaymentApproval.ts');
  const legacyApproval = read('functions/paymentTransactionApproval.ts');
  const designPayments = read('functions/designPayments.ts');
  assert.match(secureApproval, /requireMfaFinanceAdmin/);
  assert.match(secureApproval, /export const adminApprovePayment = onCall/);
  assert.match(legacyApproval, /async function requireAdmin/);
  assert.match(legacyApproval, /export const adminApprovePayment = onCall/);
  assert.match(designPayments, /export const adminReviewDesignPayment = onCall/);
  assert.match(designPayments, /actor\(request, true\)/);
});

test('painting stage payment decisions remain a separate MFA-gated finance workflow', () => {
  const helper = read('functions/paintingFinanceApprover.ts');
  const handler = read('functions/paintingProjects.ts');
  const access = read('apps/admin-panel/src/pages/ops/paintingFinanceAccess.ts');
  assert.match(helper, /PAINTING_FINANCE_APPROVER_ROLES/);
  assert.match(helper, /sign_in_second_factor/);
  assert.match(handler, /financeDecidePaintingPayment = onCall/);
  assert.match(handler, /requirePaintingFinanceApprover\(request\)/);
  assert.match(access, /canReviewPaintingPayments/);
});

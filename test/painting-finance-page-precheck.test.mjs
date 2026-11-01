import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canReviewPaintingPayments } from '../apps/admin-panel/src/pages/ops/paintingFinanceAccess.ts';

const mfa = { sign_in_second_factor: 'totp' };
test('only verified MFA finance approvers pass the page precheck', () => {
  assert.equal(canReviewPaintingPayments({ role: 'finance_manager', email_verified: true, firebase: mfa }), true);
  assert.equal(canReviewPaintingPayments({ role: 'finance_controller', email_verified: true, firebase: mfa }), true);
  assert.equal(canReviewPaintingPayments({ role: 'admin', admin: true, email_verified: true, firebase: mfa }), false);
  assert.equal(canReviewPaintingPayments({ role: 'finance_manager', email_verified: true, firebase: {} }), false);
  assert.equal(canReviewPaintingPayments({ role: 'finance_manager', email_verified: false, firebase: mfa }), false);
  assert.equal(canReviewPaintingPayments({ role: 'finance_manager', suspended: true, email_verified: true, firebase: mfa }), false);
  assert.equal(canReviewPaintingPayments(undefined), false);
});

test('page checks claims before calling the finance callable; server gate unchanged', () => {
  const page = readFileSync('apps/admin-panel/src/pages/ops/PaintingFinanceReviewPage.tsx', 'utf8');
  assert.ok(page.indexOf('canReviewPaintingPayments(') > 0);
  assert.ok(page.indexOf('canReviewPaintingPayments(') < page.indexOf("'financeListPaintingInvoices'"));
  const gate = readFileSync('functions/paintingFinanceApprover.ts', 'utf8');
  assert.match(gate, /sign_in_second_factor/);
  const fn = readFileSync('functions/paintingProjects.ts', 'utf8');
  assert.match(fn, /financeListPaintingInvoices = onCall\(\s*\{ cors: true, region: "europe-west3", enforceAppCheck: true \}/);
});

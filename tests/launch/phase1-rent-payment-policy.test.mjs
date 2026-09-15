import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('owner rent payment UI exposes only Cash and Cheque', () => {
  const source = read('src/owner/components/OwnerMoneySnapshotSection.tsx');
  assert.ok(source.includes("paymentMethod: 'CASH'"));
  assert.ok(source.includes('<MenuItem value="CASH">Cash</MenuItem>'));
  assert.ok(source.includes('<MenuItem value="CHEQUE">Cheque</MenuItem>'));
  assert.ok(!source.includes('<MenuItem value="BANK_TRANSFER">'));
  assert.ok(!source.includes('<MenuItem value="CARD">'));
  assert.ok(!source.includes('<MenuItem value="OTHER">'));
});

test('owner dashboard rent fallback is Cash, never Bank Transfer', () => {
  const source = read('src/owner/pages/OwnerDashboardResolvedPage.tsx');
  assert.ok(source.includes("paymentMethod: String(rentData.paymentMethod || 'CASH')"));
  assert.ok(!source.includes("paymentMethod: String(rentData.paymentMethod || 'BANK_TRANSFER')"));
});

test('owner rent money display preserves fils precision', () => {
  const source = read('src/owner/components/OwnerMoneySnapshotSection.tsx');
  assert.ok(source.includes('minimumFractionDigits: 2'));
  assert.ok(source.includes('maximumFractionDigits: 2'));
  assert.ok(source.includes('Math.round((rentDue - rentPaid) * 100) / 100'));
});

test('owner rent payment callable enforces Phase 1 methods and App Check', () => {
  const source = read('functions/ownerFinancialOperations.ts');
  assert.ok(source.includes('const PHASE1_RENT_PAYMENT_METHODS = new Set(["CASH", "CHEQUE"]);'));
  assert.ok(source.includes('{ cors: true, region: "europe-west3", enforceAppCheck: true }'));
  assert.ok(source.includes('request.data?.paymentMethod || "CASH"'));
  assert.ok(source.includes('if (!PHASE1_RENT_PAYMENT_METHODS.has(paymentMethod))'));
  assert.ok(source.includes('text(existing.paymentMethod, 60).toUpperCase() !== paymentMethod'));
  assert.ok(!source.includes('["BANK_TRANSFER", "CARD", "CHEQUE", "CASH_MANUAL", "OTHER"]'));
});

test('rent ledger mirror refuses non-Phase-1 methods instead of inventing Bank Transfer', () => {
  const source = read('functions/rentLedgerMirror.ts');
  assert.ok(source.includes('const PHASE1_RENT_PAYMENT_METHODS = new Set(["CASH", "CHEQUE"]);'));
  assert.ok(source.includes('if (!PHASE1_RENT_PAYMENT_METHODS.has(paymentMethod))'));
  assert.ok(source.includes('paymentMethod,'));
  assert.ok(!source.includes('payment.paymentMethod || "BANK_TRANSFER"'));
});

test('Admin approval cannot revive legacy Bank Transfer, Card or Stripe records', () => {
  const source = read('functions/securePaymentApproval.ts');
  assert.ok(source.includes('const PHASE1_RENT_PAYMENT_METHODS = new Set(["CASH", "CHEQUE"]);'));
  assert.ok(source.includes('if (!PHASE1_RENT_PAYMENT_METHODS.has(method))'));
  assert.ok(source.includes('if (!activeConfiguration.approvedMethods.includes(method))'));
  assert.ok(source.includes('This Owner activation payment method is not approved by the active Phase 1 corporate payment policy.'));
});

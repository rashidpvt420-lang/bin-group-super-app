import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summarizeCanonicalPaymentLedger } from '../../apps/admin-panel/src/lib/canonicalPaymentLedger.mjs';
import { presentCanonicalTransaction } from '../../apps/admin-panel/src/lib/canonicalTransactionView.mjs';
import { summarizeControlCentreMoney } from '../../apps/admin-panel/src/lib/controlCentreMoney.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('FIN-002 collected cash comes from verified payment_transactions, not passport rollups', () => {
  const money = summarizeControlCentreMoney(
    [
      {
        recordType: 'OWNER_RENT_PAYMENT',
        amount: 2500.4,
        amountPaid: 9999,
        rentCollectedTotal: 888888,
        paymentVerified: true,
        paymentStatus: 'APPROVED',
        balance: 100.1,
      },
      {
        recordType: 'OWNER_RENT_PAYMENT',
        amount: 0.2,
        paymentVerified: true,
        status: 'APPROVED',
        balance: 0,
      },
      {
        recordType: 'OWNER_RENT_PAYMENT',
        amount: 4000,
        paymentVerified: false,
        paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
        status: 'PAID',
        balance: 75.05,
        rentOutstandingTotal: 500000,
      },
      {
        recordType: 'MOBILIZATION_DEPOSIT',
        amount: 15.1,
        paymentVerified: true,
        paymentStatus: 'APPROVED',
        rentCollectedTotal: 1,
      },
      {
        type: 'EXPENSE',
        amount: 10,
        paymentVerified: true,
      },
    ],
    [
      { status: 'ACTIVE', annualContractValue: 120000.1 },
      { status: 'DRAFT', annualRent: 900000 },
      { status: 'ACTIVE', annualContractValue: 0.2 },
    ],
  );

  assert.equal(money.collected, 2515.7);
  assert.equal(money.outstanding, 175.15);
  assert.equal(money.projectedAnnualRent, 120000.3);
  assert.equal(money.verifiedPaymentCount, 3);
  assert.equal(money.pendingAmount, 4000);
});

test('FIN-002 missing verified amount or active contract value stays N/A instead of zero', () => {
  const money = summarizeControlCentreMoney(
    [{ recordType: 'OWNER_RENT_PAYMENT', paymentVerified: true, paymentStatus: 'APPROVED', balance: 'not-money' }],
    [{ status: 'ACTIVE' }, { status: 'ACTIVE', annualContractValue: 10 }],
  );
  assert.equal(money.collected, null);
  assert.equal(money.outstanding, null);
  assert.equal(money.projectedAnnualRent, null);
  assert.equal(money.recordedAnnualValues, 1);
});

test('FIN-002 a truncated payment window cannot be presented as a complete collected total', () => {
  const money = summarizeControlCentreMoney(
    [{ amount: 10, paymentVerified: true, paymentStatus: 'APPROVED' }],
    [],
    { paymentsTruncated: true },
  );
  assert.equal(money.collected, null);
  assert.equal(money.outstanding, null);
  assert.equal(money.pendingAmount, null);
});

test('FIN-002 transaction rows use canonical payment fields and fils-rounded amounts', () => {
  const pending = presentCanonicalTransaction({
    recordType: 'OWNER_RENT_PAYMENT',
    tenantName: 'Amina',
    propertyName: 'Marina Tower',
    unitNumber: '1204',
    amountPaid: 2500.555,
    paymentVerified: false,
    paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    status: 'PAID',
  });
  assert.equal(pending.description, 'Amina · Marina Tower · 1204');
  assert.equal(pending.category, 'OWNER_RENT_PAYMENT');
  assert.equal(pending.amount, 2500.55);
  assert.equal(pending.direction, 'pending');

  const verified = presentCanonicalTransaction({
    description: 'Activation deposit',
    amount: 15.1,
    paymentVerified: true,
    category: 'MOBILIZATION',
  });
  assert.equal(verified.direction, 'credit');
  assert.equal(verified.amount, 15.1);

  const ledger = summarizeCanonicalPaymentLedger([
    { amount: 15.1, paymentVerified: true },
    { amountPaid: 2500.555, paymentVerified: false, paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION', status: 'PAID' },
  ]);
  assert.equal(ledger.totalRevenue, 15.1);
  assert.equal(ledger.pendingAmount, 2500.55);
  assert.equal(ledger.expenses, null);
});

test('FIN-002 admin transactions and control centre no longer read the legacy money fields', () => {
  const transactions = read('apps/admin-panel/src/pages/financials/TransactionsPage.tsx');
  const control = read('apps/admin-panel/src/pages/ProductionControlCenter.tsx');

  assert.match(transactions, /collection\(db,\s*['"]payment_transactions['"]\)/);
  assert.doesNotMatch(transactions, /collection\(db,\s*['"]transactions['"]\)/);
  assert.match(transactions, /summarizeCanonicalPaymentLedger/);
  assert.match(transactions, /presentCanonicalTransaction/);
  assert.doesNotMatch(transactions, /t\.type === 'credit'/);
  assert.match(transactions, /archived_contracts/);

  assert.match(control, /collection\(db,\s*['"]payment_transactions['"]\)/);
  assert.match(control, /summarizeControlCentreMoney/);
  assert.doesNotMatch(control, /rentCollectedTotal/);
  assert.doesNotMatch(control, /rentOutstandingTotal/);
  assert.doesNotMatch(control, /annualRentTotal/);
  assert.doesNotMatch(control, /\/ 1000000/);
  assert.doesNotMatch(control, /\/ 1000\)/);
});

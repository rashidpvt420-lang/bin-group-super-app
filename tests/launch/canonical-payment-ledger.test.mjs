import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCanonicalPaymentLedger } from '../../apps/admin-panel/src/lib/canonicalPaymentLedger.mjs';

test('verified canonical payments sum in fils and ignore the legacy credit/debit type filter', () => {
  const summary = summarizeCanonicalPaymentLedger([
    {
      id: 'activation',
      paymentVerified: true,
      paymentStatus: 'APPROVED',
      amount: 47817.6,
      propertyId: 'property-a',
      propertyName: 'Marina Tower',
    },
    {
      id: 'rent',
      recordType: 'OWNER_RENT_PAYMENT',
      transactionType: 'RENT_COLLECTION',
      paymentVerified: true,
      paymentStatus: 'APPROVED',
      amountPaid: 0.1,
      propertyId: 'property-a',
      propertyName: 'Marina Tower',
    },
    {
      id: 'fils',
      verified: true,
      status: 'PAID',
      amount: 0.2,
      propertyId: 'property-b',
      propertyName: 'JLT Walk-up',
    },
  ]);

  assert.equal(summary.ledgerComplete, true);
  assert.equal(summary.creditCount, 3);
  assert.equal(summary.totalRevenue, 47817.9);
  assert.equal(summary.expenses, null);
  assert.equal(summary.netProfit, null);
  assert.equal(summary.propertyRows[0].name, 'Marina Tower');
  assert.equal(summary.propertyRows[0].revenue, 47817.7);
  assert.equal(summary.propertyRows[1].revenue, 0.2);
});

test('unverified rent with a paid status stays out of revenue and remains visible as pending', () => {
  const summary = summarizeCanonicalPaymentLedger([
    {
      id: 'pending-rent',
      recordType: 'OWNER_RENT_PAYMENT',
      status: 'PAID',
      paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
      paymentVerified: false,
      amount: 2500.5,
    },
    {
      recordType: 'REFUND',
      paymentVerified: true,
      amount: 99,
    },
  ]);

  assert.equal(summary.totalRevenue, 0);
  assert.equal(summary.creditCount, 0);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.pendingAmount, 2500.5);
});

test('a verified payment with no amount invalidates revenue instead of counting as zero', () => {
  const summary = summarizeCanonicalPaymentLedger([
    { paymentVerified: true, paymentStatus: 'APPROVED', amount: 10 },
    { paymentVerified: true, paymentStatus: 'APPROVED' },
  ]);

  assert.equal(summary.ledgerComplete, false);
  assert.equal(summary.totalRevenue, null);
  assert.equal(summary.creditCount, 2);
});

test('explicit expense rows sum separately and do not erase verified revenue', () => {
  const summary = summarizeCanonicalPaymentLedger([
    { paymentVerified: true, amount: 100.25, propertyId: 'p1', propertyName: 'Asset' },
    { type: 'EXPENSE', category: 'Maintenance', amount: 40.1, propertyId: 'p1', propertyName: 'Asset' },
    { recordType: 'DEBIT', category: 'Maintenance', amount: 0.15, propertyId: 'p1', propertyName: 'Asset' },
  ]);

  assert.equal(summary.totalRevenue, 100.25);
  assert.equal(summary.expenses, 40.25);
  assert.equal(summary.netProfit, 60);
  assert.equal(summary.propertyRows[0].opex, 40.25);
  assert.equal(summary.expenseBreakdown[0].amount, 40.25);
});

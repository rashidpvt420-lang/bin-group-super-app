import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildOwnerFinancialTruthSummary,
  summarizeOwnerPaidInvoices,
  summarizeOwnerVerifiedNoi,
} from '../../functions/shared/propertyPassportAggregation.mjs';

const read = (path) => readFileSync(path, 'utf8');

test('paid mobilization invoice is counted even when passport rent is zero (live zero-totals repro)', () => {
  const paid = summarizeOwnerPaidInvoices([
    { id: 'inv1', status: 'PAID', feeType: 'MOBILIZATION_DEPOSIT', amount: 22707.38 },
    { id: 'inv2', status: 'PENDING', amount: 5000 },
    { id: 'inv3', status: 'paid', amountPaid: 100.5 },
  ]);
  assert.equal(paid.count, 2);
  assert.equal(paid.total, 22807.88);

  const summary = buildOwnerFinancialTruthSummary({
    passports: [{ id: 'p1', rentCollectedTotal: 0 }],
    invoices: [{ id: 'inv1', status: 'PAID', amount: 22707.38 }],
    properties: [],
  });
  assert.equal(summary.totalRevenue, 0);
  assert.equal(summary.netPayout, 0);
  assert.equal(summary.paidInvoiceTotal, 22707.38);
  assert.equal(summary.primaryKind, 'paid_invoices');
  assert.equal(summary.primaryValue, 22707.38);
  assert.equal(summary.verifiedNoi, null);
});

test('VERIFIED NOI matches advanced Owner intelligence basis and beats empty rent headline', () => {
  const noi = summarizeOwnerVerifiedNoi([
    {
      annualRent: 120000,
      maintenanceCostTotal: 5000,
      operatingExpenses: 7000,
      managementFeesTotal: 6000,
    },
  ]);
  assert.equal(noi.status, 'VERIFIED');
  assert.equal(noi.verifiedNoi, 102000);
  assert.match(noi.basis, /Annual rent less recorded/);

  const summary = buildOwnerFinancialTruthSummary({
    passports: [{ id: 'p1', rentCollectedTotal: 0 }],
    invoices: [{ id: 'inv1', status: 'PAID', amount: 22707.38 }],
    properties: [{ annualRentalIncome: 120000, maintenanceCost: 5000, opex: 7000, annualManagementFees: 6000 }],
  });
  assert.equal(summary.verifiedNoi, 102000);
  assert.equal(summary.verifiedNoiStatus, 'VERIFIED');
  assert.equal(summary.paidInvoiceTotal, 22707.38);
  // NOI is the advanced truth headline when rent cash is still zero.
  assert.equal(summary.primaryKind, 'verified_noi');
  assert.equal(summary.primaryValue, 102000);
});

test('collected rent payout remains the primary headline when passport cash exists', () => {
  const summary = buildOwnerFinancialTruthSummary({
    passports: [{ id: 'p1', rentCollectedTotal: 10000, maintenanceCostTotal: 500 }],
    invoices: [{ id: 'inv1', status: 'PAID', amount: 22707.38 }],
    properties: [{ annualRent: 120000 }],
    feeRate: 0.05,
  });
  assert.equal(summary.totalRevenue, 10000);
  assert.equal(summary.managementFees, 500);
  assert.equal(summary.netPayout, 9000);
  assert.equal(summary.primaryKind, 'net_payout');
  assert.equal(summary.primaryValue, 9000);
  assert.equal(summary.verifiedNoi, 120000);
  assert.equal(summary.paidInvoiceTotal, 22707.38);
});

test('dashboard card and financials page consume the shared truth builder', () => {
  const card = read('src/owner/components/OwnerFinancialTruthCard.tsx');
  const financials = read('src/owner/pages/OwnerFinancialsPage.tsx');
  const hook = read('src/owner/hooks/useOwnerFinancialTruthData.ts');
  const engine = read('src/utils/propertyIntelligenceEngine.ts');

  assert.match(hook, /buildOwnerFinancialTruthSummary/);
  assert.match(hook, /collection\(db, 'invoices'\)/);
  assert.match(hook, /collection\(db, 'properties'\)/);
  assert.match(hook, /where\('ownerUid', '==', uid\)/);
  assert.match(hook, /where\('ownerId', '==', uid\)/);
  assert.match(card, /useOwnerFinancialTruthData/);
  assert.match(card, /primaryKind/);
  assert.match(card, /paidInvoiceTotal/);
  assert.match(card, /verifiedNoi/);
  assert.match(financials, /useOwnerFinancialTruthData/);
  assert.match(financials, /Verified NOI/);
  assert.match(financials, /Paid Invoices/);
  assert.match(engine, /summarizeOwnerVerifiedNoi/);
  assert.doesNotMatch(card, /Never invent/);
});

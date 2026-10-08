import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ledgerMoney,
  mergePassportRecords,
  passportIdentity,
  summarizeOwnerPassportFinancials,
  summarizePropertyPassportSources,
} from '../../functions/shared/propertyPassportAggregation.mjs';

const read = (path) => readFileSync(path, 'utf8');

test('canonical rent ledger amounts feed property passport totals in fils', () => {
  const summary = summarizePropertyPassportSources({
    units: [
      { occupancyStatus: 'OCCUPIED' },
      { occupancyStatus: 'occupied' },
      { occupancyStatus: 'VACANT' },
    ],
    leases: [{ leaseStatus: 'ACTIVE' }, { status: 'expired' }],
    ledgers: [
      { rentPaid: 1500.5, balance: 200.25 },
      { amountPaid: 10.105, rentDue: 20.1 },
      { paidBalance: 80, outstandingBalance: 20 },
    ],
    tickets: [{ status: 'COMPLETED' }, { status: 'open' }],
  });

  assert.equal(summary.occupiedUnits, 2);
  assert.equal(summary.vacantUnits, 1);
  assert.equal(summary.activeLeases, 1);
  assert.equal(summary.expiredLeases, 1);
  assert.equal(summary.rentCollectedTotal, 1590.61);
  assert.equal(summary.rentOutstandingTotal, 230.24);
  assert.equal(summary.maintenanceTicketsClosed, 1);
  assert.equal(summary.maintenanceTicketsOpen, 1);
  assert.equal(ledgerMoney({ rentPaid: 0, paidBalance: 80 }).collected, 0);
});

test('passport identity keeps owner id and a lowercase email without inventing blanks', () => {
  assert.deepEqual(passportIdentity({ ownerUid: 'owner_1', ownerEmail: 'Owner@Example.test' }), {
    ownerId: 'owner_1',
    ownerEmail: 'owner@example.test',
  });
  assert.deepEqual(passportIdentity({ name: 'Tower' }), {});
});

test('owner financial summary sums recorded passport totals once and keeps fils', () => {
  const passports = mergePassportRecords([
    [{ id: 'p1', rentCollectedTotal: 1000.1, maintenanceCostTotal: 10.05 }],
    [{ id: 'p1', rentCollectedTotal: 1 }, { id: 'p2', grossRentCollected: 200.2, pendingVerification: 15.55 }],
  ]);
  const summary = summarizeOwnerPassportFinancials(passports, 0.05);
  assert.equal(summary.propertyCount, 2);
  assert.equal(summary.totalRevenue, 1200.3);
  assert.equal(summary.managementFees, 60.02);
  assert.equal(summary.maintenanceDeductions, 10.05);
  assert.equal(summary.pendingVerification, 15.55);
  assert.equal(summary.netPayout, 1130.23);
});

test('passport sync and owner financial surfaces use the canonical ledger summary', () => {
  const aggregator = read('functions/index.ts');
  const hook = read('src/owner/utils/useOwnerPropertyPassports.ts');
  const truthHook = read('src/owner/hooks/useOwnerFinancialTruthData.ts');
  const financials = read('src/owner/pages/OwnerFinancialsPage.tsx');
  const truth = read('src/owner/components/OwnerFinancialTruthCard.tsx');
  const report = read('src/owner/pages/OwnerPLReportPage.tsx');
  const roi = read('src/owner/pages/OwnerRoiPage.tsx');

  assert.match(aggregator, /summarizePropertyPassportSources/);
  assert.match(aggregator, /passportIdentity/);
  assert.doesNotMatch(aggregator, /Number\(data\.paidBalance\)/);
  for (const source of [report, truthHook]) {
    assert.match(source, /useOwnerPropertyPassports/);
  }
  assert.match(roi, /useOwnerFinancialTruthData/);
  assert.match(roi, /resolveOwnerFinancialTruth/);
  assert.doesNotMatch(roi, /useOwnerPropertyPassports/);
  assert.match(truth, /useOwnerFinancialTruthData/);
  assert.match(financials, /useOwnerFinancialTruthData/);
  assert.match(hook, /field: 'ownerId'/);
  assert.match(hook, /field: 'ownerEmail'/);
  assert.match(hook, /where\(spec\.field, '==', spec\.value\)/);
  assert.match(truthHook, /buildOwnerFinancialTruthSummary/);
  assert.doesNotMatch(financials, /collection\(db, 'propertyPassports'\)/);
});

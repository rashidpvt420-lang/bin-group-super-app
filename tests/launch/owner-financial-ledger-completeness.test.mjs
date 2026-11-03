import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('Owner financial history can be fetched with stable cursor pages rather than silent fixed caps', () => {
  const source = read('src/owner/pages/OwnerFinancialsPage.tsx');
  assert.match(source, /FINANCIAL_HISTORY_PAGE_SIZE = 100/);
  assert.match(source, /FINANCIAL_HISTORY_MAX_PAGES = 100/);
  assert.match(source, /orderBy\(documentId\(\)\)/);
  assert.match(source, /startAfter\(cursor\)/);
  assert.match(source, /fetchAllOwnerFinancialRows/);
  assert.match(source, /LOAD COMPLETE FINANCIAL HISTORY/);
  assert.match(source, /invoiceHistoryComplete/);
  assert.match(source, /payoutHistoryComplete/);
  assert.doesNotMatch(source, /setTransactions\(rows\.slice\(0,\s*25\)\)/);
});

test('Partial payout history cannot be exported as a complete ledger', () => {
  const source = read('src/owner/pages/OwnerFinancialsPage.tsx');
  assert.match(source, /disabled=\{!transactions\.length \|\| !payoutHistoryComplete\}/);
  assert.match(source, /Export disabled until full history loads/);
  assert.match(source, /10,000-record safety limit/);
  assert.match(source, /Load more transactions/);
  assert.match(source, /Load more invoices/);
});

test('Unknown financial status and dates are not presented as paid/completed/current by default', () => {
  const source = read('src/owner/pages/OwnerFinancialsPage.tsx');
  assert.match(source, /STATUS UNAVAILABLE/);
  assert.match(source, /payoutStatusColor/);
  assert.match(source, /formatInvoiceDate\(txn\.createdAt \|\| txn\.date\)/);
  assert.doesNotMatch(source, /txn\.status\?\.toUpperCase\(\) \|\| 'COMPLETED'/);
  assert.doesNotMatch(source, /txn\.date \|\| 'Today'/);
});

test('Owner financial summary names the net figure as historical rather than a future payout forecast', () => {
  const source = read('src/owner/pages/OwnerFinancialsPage.tsx');
  assert.match(source, /RECORDED NET OWNER PAYOUT/);
  assert.match(source, /not a forecast of the next payment/);
  assert.doesNotMatch(source, /NEXT PROJECTED PAYOUT/);
});

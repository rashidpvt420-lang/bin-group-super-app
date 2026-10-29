// Pure statement helpers: period limits, voids, totals, CSV safety and Arabic labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatementRows, parseStatementRange, statementCsv, statementTotals, STATEMENT_LABELS } from '../functions/moneyStatementCore.ts';

const range = parseStatementRange('2026-09-01', '2026-09-30', new Date('2026-10-29T00:00:00Z'));
const records = [
  { collection: 'invoices', id: 'i1', data: { ownerId: 'u', amount: 1000, status: 'issued', issuedAt: '2026-09-02' } },
  { collection: 'payment_transactions', id: 'p1', data: { ownerId: 'u', payerId: 't', amount: 1000, status: 'paid', paidAt: '2026-09-03' } },
  { collection: 'payment_transactions', id: 'p1', data: { ownerId: 'u', payerId: 't', amount: 1000, status: 'paid', paidAt: '2026-09-03' } },
  { collection: 'payment_transactions', id: 'p2', data: { ownerId: 'u', payerId: 't', amount: 50, status: 'pending', paidAt: '2026-09-04' } },
  { collection: 'payment_collection_records', id: 'c1', data: { payerUid: 'u', amount: 200, collectedOn: '2026-09-05', status: 'collected' } },
  { collection: 'payment_collection_records', id: 'c2', data: { payerUid: 'u', amount: 900, collectedOn: '2026-09-06', status: 'collected', description: '=HYPERLINK("http://x")' } },
  { collection: 'payroll_entries', id: 'w1', data: { technicianId: 'u', netPay: 3000, status: 'paid', paidAt: '2026-10-02' } },
];

test('rows: dedupe, period filter, void kept as void', () => {
  const rows = buildStatementRows('u', records, { c2: { payerUid: 'u' } }, range);
  assert.equal(rows.length, 5);
  assert.equal(rows.find((r) => r.reference === 'c2').status, 'void');
});

test('totals: settled only, voids excluded', () => {
  const t = statementTotals(buildStatementRows('u', records, { c2: {} }, range));
  assert.deepEqual([t.moneyIn, t.moneyOut, t.net, t.invoiced, t.voidedCount], [1000, 200, 800, 1000, 1]);
});

test('period validation', () => {
  assert.throws(() => parseStatementRange('2026-09-30', '2026-09-01'));
  assert.throws(() => parseStatementRange('2024-01-01', '2026-01-01'));
  assert.throws(() => parseStatementRange('2026/09/01', '2026-09-30'));
});

test('CSV has BOM, Arabic labels and neutralises formulas', () => {
  const rows = buildStatementRows('u', records, { c2: {} }, range);
  const csv = statementCsv(rows, { documentId: 'stmt_x', holder: 'رشيد', role: 'owner', from: '2026-09-01', to: '2026-09-30', issuedAtIso: '2026-10-29T00:00:00Z', verifyUrl: 'https://bin-groups.com/verify/document/stmt_x', language: 'ar' });
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes(STATEMENT_LABELS.ar.title));
  assert.ok(csv.includes('رشيد'));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.env.UI_AUDIT_ROOT ? `${process.env.UI_AUDIT_ROOT}/` : new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');
const buttonTag = (src, label) => {
  const at = src.indexOf(label);
  assert.ok(at > 0, `"${label}" missing`);
  return src.slice(src.lastIndexOf('<Button', at), at);
};

const wired = [
  ['src/owner/pages/OwnerRoiPage.tsx', 'Export CSV'],
  ['src/owner/pages/OwnerRoiPage.tsx', 'Request review'],
  ['src/pages/PropertyUnitsPage.tsx', 'VIEW CERTIFICATES'],
  ['src/pages/ExecutiveReportingPage.tsx', 'REVIEW RENEWALS'],
  ['src/owner/pages/OwnerFinancialsPage.tsx', "'Export transactions'"],
];
for (const [file, label] of wired) {
  test(`${label} has a real handler (${file.split('/').pop()})`, () => assert.match(buttonTag(read(file), label), /onClick=/));
}

test('dead owner buttons are gone or are not buttons', () => {
  assert.doesNotMatch(read('src/owner/pages/OwnerRoiPage.tsx'), />Last 12 Months</);
  assert.doesNotMatch(read('src/owner/pages/OwnerPropertiesPage.tsx'), />Grid View</);
  assert.doesNotMatch(read('src/owner/pages/OwnerTenantsPage.tsx'), /<Button[^>]*>\s*RERA Compliant/);
});

test('CSV helper quotes cells and blocks spreadsheet formulas', async () => {
  const src = read('src/utils/downloadCsv.ts');
  const js = src.slice(src.indexOf('const escapeCell'), src.indexOf('export function downloadCsv'))
    .replace(/\(value: CsvCell\)/, '(value)').replace(/\(header: string\[\], rows: CsvCell\[\]\[\]\)/, '(header, rows)')
    .replace('export const toCsv', 'const toCsv');
  const toCsv = new Function(`${js}; return toCsv;`)();
  assert.equal(toCsv(['a', 'b'], [['=1+1', 'say "hi"']]), '"a","b"\r\n"\'=1+1","say ""hi"""');
});

test('Owner Financial Truth card has no developer wording', () => {
  const src = read('src/owner/components/OwnerFinancialTruthCard.tsx');
  // The code comment may name the collection; the visible EN/AR strings must not.
  assert.doesNotMatch(src, /source: '[^']*(propertyPassports|Owner-scoped)/);
  assert.match(src, /source: 'Figures come from your verified property records\./);
});

test('owner command strip tiles are light with dark text', () => {
  const src = read('src/components/OwnerApprovalCommandStrip.tsx');
  assert.doesNotMatch(src, /rgba\(15,23,42,0\.86\)/);
  assert.match(src, /color: '#111827', bgcolor: '#FFFFFF', border: '1px solid #E5E7EB'/);
});

for (const file of ['src/pages/ReportingDashboard.tsx', 'src/pages/ExecutiveReportingPage.tsx', 'src/pages/PropertyUnitsPage.tsx', 'src/pages/MaintenanceCalendarPage.tsx']) {
  test(`${file.split('/').pop()} has no white text left on its light page`, () => {
    const src = read(file);
    assert.doesNotMatch(src, /color: '#FFF'|color="#FFF"|rgba\(22, 22, 24/);
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

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
  assert.doesNotMatch(read('src/owner/pages/OwnerTenantsPage.tsx'), /RERA Compliant|Institutional Audit Stream/);
});

test('Owner directory has no enabled controls without an action, including nested JSX icons', () => {
  const source = read('src/owner/pages/OwnerTenantsPage.tsx');
  const ast = ts.createSourceFile('OwnerTenantsPage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const dead = [];
  function visit(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        ['Button', 'IconButton'].includes(node.tagName.getText(ast))) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute).map((attribute) => attribute.name.getText(ast));
      if (!attributes.some((name) => ['href', 'to', 'onClick', 'disabled'].includes(name))) dead.push(node.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.deepEqual(dead, [], 'enabled controls must have a destination or handler');
});

test('CSV helper quotes cells and blocks spreadsheet formulas', () => {
  const src = read('src/utils/downloadCsv.ts');
  // Static checks only (no eval): leading formula characters get a ' prefix, quotes are doubled,
  // every cell is wrapped in quotes.
  assert.ok(src.includes("if (typeof value === 'string' && /^[=+\\-@\\t\\r]/.test(text)) text = `'${text}`;"), 'formula prefix guard');
  assert.ok(src.includes('return `"${text.replace(/"/g, \'""\')}"`;'), 'quote doubling');
  assert.ok(src.includes(".map((row) => row.map(escapeCell).join(','))"), 'every cell escaped');
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

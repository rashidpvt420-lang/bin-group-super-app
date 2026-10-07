import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.env.UI_AUDIT_ROOT ? `${process.env.UI_AUDIT_ROOT}/` : new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');

test('Control Center never claims success for actions that call no server function', () => {
  const control = read('apps/admin-panel/src/pages/ProductionControlCenter.tsx');
  assert.doesNotMatch(control, /Aggregation task queued/);
  assert.doesNotMatch(control, /Dispatching recovery emails/);
  assert.doesNotMatch(control, /Functionality restricted in production mode/);
  assert.match(control, /navigate\('\/tenants'\)/);
});

// Each label must sit on a button element that has a handler or is disabled.
const cases = [
  ['apps/admin-panel/src/pages/admin/AuditShieldPage.tsx', 'Verify hashes'],
  ['apps/admin-panel/src/pages/admin/AuditShieldPage.tsx', 'Export bundle'],
  ['apps/admin-panel/src/pages/admin/PricingMatrixPage.tsx', 'Export CSV'],
  ['apps/admin-panel/src/pages/admin/PricingMatrixPage.tsx', 'Report (not available yet)'],
  ['apps/admin-panel/src/components/reports/InstitutionalReportsPanel.tsx', 'Export audit (JSON)'],
];
for (const [file, label] of cases) {
  test(`"${label}" is wired or honestly disabled (${file.split('/').pop()})`, () => {
    const src = read(file);
    const at = src.indexOf(label);
    assert.ok(at > 0, 'label missing');
    const open = Math.max(src.lastIndexOf('<Button', at), src.lastIndexOf('<button', at));
    assert.match(src.slice(open, at), /onClick=|disabled/);
  });
}

test('Audit log filter icon does something: it focuses the search box that filters', () => {
  const src = read('apps/admin-panel/src/pages/AuditLogPage.tsx');
  assert.match(src, /'Filter audit log'\} title=\{[^}]+\} onClick=\{\(\) => searchInputRef\.current\?\.focus\(\)\}/);
  assert.match(src, /inputRef=\{searchInputRef\}/);
});

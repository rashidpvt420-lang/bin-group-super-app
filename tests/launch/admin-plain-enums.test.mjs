import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = process.env.UI_AUDIT_ROOT ? `${process.env.UI_AUDIT_ROOT}/` : new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');
const admin = 'apps/admin-panel/src/';

// Same rules as apps/admin-panel/src/utils/humanizeEnum.ts (pinned to the source below).
const ENUM_TOKEN = /^[A-Za-z0-9]+(_[A-Za-z0-9]+)+$|^[A-Z0-9]{4,}$/;
const KEEP_UPPER = new Set(['AED', 'UAE', 'RERA', 'DLD', 'SOS', 'ID', 'QR', 'PDF', 'CSV', 'AC', 'HVAC', 'IBAN', 'VAT']);
const humanizeEnum = (value) => {
  const text = String(value ?? '').trim();
  if (!text || !ENUM_TOKEN.test(text)) return text;
  const words = text.split('_').filter(Boolean).map((w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w.toLowerCase()));
  const s = words.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

test('humanizeEnum helper exists and uses the same token rule', () => {
  assert.ok(existsSync(`${root}${admin}utils/humanizeEnum.ts`));
  const src = read(`${admin}utils/humanizeEnum.ts`);
  assert.ok(src.includes(`/${ENUM_TOKEN.source}/.test(text)`));
  assert.ok(src.includes("'AED', 'UAE', 'RERA', 'DLD', 'SOS', 'ID', 'QR', 'PDF', 'CSV', 'AC', 'HVAC', 'IBAN', 'VAT'"));
});

test('stored enums read as plain words; normal text is untouched', () => {
  assert.equal(humanizeEnum('MAINTENANCE_AND_PROPERTY_MANAGEMENT'), 'Maintenance and property management');
  assert.equal(humanizeEnum('RESIDENTIAL_BUILDING'), 'Residential building');
  assert.equal(humanizeEnum('maintenance_evidence_standard'), 'Maintenance evidence standard');
  assert.equal(humanizeEnum('financial_record_7_years'), 'Financial record 7 years');
  assert.equal(humanizeEnum('assigned_technician'), 'Assigned technician');
  assert.equal(humanizeEnum('Gold plan'), 'Gold plan');
  assert.equal(humanizeEnum('Property'), 'Property');
});

test('admin pilot, institutional report and data-governance screens use it for display', () => {
  assert.match(read(`${admin}components/pilot/PilotCommandCenter.tsx`), /humanizeEnum\(contract\.planName \|\| contract\.servicePlan \|\| contract\.contractType/);
  assert.match(read(`${admin}components/reports/InstitutionalReportsPanel.tsx`), /const type = humanizeEnum\(row\.propertyType/);
  const gov = read(`${admin}pages/admin/DataGovernanceAuditPage.tsx`);
  assert.match(gov, /<MenuItem key=\{x\} value=\{x\}>\{humanizeEnum\(x\)\}<\/MenuItem>/);
  assert.match(gov, /\{humanizeEnum\(event\.dataCategory\)\}/);
  assert.match(gov, /label=\{humanizeEnum\(role\)\}/);
});

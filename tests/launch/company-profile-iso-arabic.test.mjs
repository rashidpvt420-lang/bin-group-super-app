// Company profile must not claim ISO/IEC 27001 (the certificate was never
// produced; the badge added in #1847 stayed after #1966 only cleaned login).
// Contact labels stay bilingual; numbers stay LTR inside Arabic layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../src/pages/public/CompanyProfilePage.tsx', import.meta.url), 'utf8');

test('company profile has no ISO/IEC 27001 badge or certification claim', () => {
  assert.doesNotMatch(src, /data-testid="company-iso-27001"/);
  assert.doesNotMatch(src, /isoBadge/);
  assert.doesNotMatch(src, /ISO\s*\/?\s*IEC\s*27001/i);
  assert.doesNotMatch(src, /ISO\s*27001/i);
  assert.match(src, /license: 'All Kind Building Projects Contracting L\.L\.C S\.P\.C, trading as BIN GROUP L\.L\.C - S\.P\.C · Trade licence CN-5914744 \(issued 2025\)'/);
});

test('contact card labels are translated and aligned for RTL', () => {
  assert.match(src, /contactLabels: \{ phone: 'الهاتف', whatsapp: 'واتساب', email: 'البريد الإلكتروني', location: 'الموقع' \}/);
  assert.doesNotMatch(src, /\[<Phone size=\{22\} \/>, 'Phone'/);
  assert.match(src, /textAlign: isRTL \? 'right' : 'left'/);
  assert.match(src, /<bdi>\{value\}<\/bdi>/);
});

test('page keeps its current public email (single-source change is separate)', () => {
  assert.match(src, /email: 'ceo@bin-groups\.com'/);
});

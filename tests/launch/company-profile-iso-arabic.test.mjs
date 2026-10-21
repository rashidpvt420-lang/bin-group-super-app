// Company profile: ISO 27001 badge stays (Rashid confirmed the certificate) and
// contact labels are bilingual; numbers stay LTR inside Arabic layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../src/pages/public/CompanyProfilePage.tsx', import.meta.url), 'utf8');

test('ISO/IEC 27001 badge is shown in EN and AR without invented certificate details', () => {
  assert.match(src, /data-testid="company-iso-27001"/);
  assert.match(src, /isoBadge: 'ISO\/IEC 27001 certified'/);
  assert.match(src, /isoBadge: 'حاصلة على شهادة ISO\/IEC 27001'/);
  assert.doesNotMatch(src, /certificate (no|number)|cert(ificate)?No/i);
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

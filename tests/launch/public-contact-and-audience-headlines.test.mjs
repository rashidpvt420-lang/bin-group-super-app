import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const s = await readFile('src/pages/public/PublicMarketingPage.tsx', 'utf8');

test('/contact renders real contact details before the generic profile', () => {
  assert.match(s, /function ContactDetailsSection\(/);
  for (const v of ['+971 55 7474560', '+971 55 2423233', 'ceo@bin-groups.com', 'Al Ain, Abu Dhabi']) assert.ok(s.includes(v), v);
  const body = s.slice(s.indexOf('<Hero c={c} />'), s.indexOf('<Inquiry c={c} />'));
  assert.ok(body.indexOf('ContactDetailsSection') < body.indexOf('CompanyProfileBlock'));
  assert.match(s, /`tel:\$\{/);
  assert.match(s, /wa\.me\/\$\{wa\}/);
  assert.match(s, /mailto:/);
});

test('every audience page has its own headline', () => {
  for (const k of ['owners', 'tenants', 'technicians', 'brokers', 'property-management', 'maintenance', 'majlis-care', 'stadiums', 'hotels', 'malls', 'hospitals', 'government-properties', 'contact']) {
    assert.ok(s.includes(`\n    '${k}': ['`) || s.includes(`\n    ${k}: ['`), k);
  }
  assert.match(s, /title: headline\[0\], desc: headline\[1\]/);
});

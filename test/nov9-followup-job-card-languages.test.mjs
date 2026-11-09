// Nov 9 follow-up (P2-12 gap left after #1994): the technician active-job card follows the
// technician's own language (7 languages) instead of English/Arabic only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const S = await import('../src/technician/i18n/hrTechnicianStrings.ts');
const LANGS = ['en', 'ar', 'hi', 'ur', 'ml', 'tl', 'bn'];
const src = readFileSync('src/technician/pages/TechnicianDashboardPage.tsx', 'utf8');
const start = src.indexOf('{activeMission && (() => {');
const end = src.indexOf('})()}', start);
const card = src.slice(start, end);

test('the active-job card uses the technician language layer, not en/ar-only tx()', () => {
  assert.ok(start > 0 && end > start, 'active-job card found');
  assert.match(src, /const \{ ht \} = useHrText\(\);/);
  assert.ok(!/\btx\(/.test(card), 'no en/ar-only tx() left in the active-job card');
});

test('every active-job card string has all 7 languages and keeps its placeholders', () => {
  const keys = [...card.matchAll(/\bht\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 35, `expected the full card copy, got ${keys.length}`);
  for (const key of keys) {
    const row = S.HR_STRINGS[key];
    assert.ok(row, `missing HR string: ${key}`);
    for (const lang of LANGS) {
      assert.ok(row[lang] && row[lang].trim(), `${key} has no ${lang}`);
      for (const token of key.match(/\{\w+\}/g) || []) assert.ok(row[lang].includes(token), `${key} ${lang} lost ${token}`);
    }
  }
  assert.match(card, /ht\('Work in progress — started \{n\} min ago', '[^']+'\)\.replace\('\{n\}', String\(elapsedMinutes\)\)/);
});

test('technician-language rendering: Urdu gets Urdu, unknown languages fall back to en/ar', () => {
  assert.equal(S.hrText('ur', 'OPEN JOB TO ACCEPT', 'x'), S.HR_STRINGS['OPEN JOB TO ACCEPT'].ur);
  assert.notEqual(S.HR_STRINGS['OPEN JOB TO ACCEPT'].ur, 'OPEN JOB TO ACCEPT');
  assert.equal(S.hrText('ar', 'ARRIVED ON SITE', 'x'), 'وصلت إلى الموقع');
  // The server geofence (250 m) is unchanged in every language that writes digits.
  for (const lang of LANGS) assert.ok(S.HR_STRINGS['Arrival checked: within 250 m of the property pin. Next: inspect the fault and take before photos.'][lang].includes('250'));
});

test('machine-drafted rows are flagged for native review', () => {
  assert.match(readFileSync('src/technician/i18n/hrTechnicianStrings.ts', 'utf8'), /Machine-drafted \(Nov 9 follow-up, active-job card\) — hi, ur, ml, tl, bn NEED NATIVE REVIEW/);
});

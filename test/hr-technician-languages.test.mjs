import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const S = await loadTsModules('src/technician/i18n/hrTechnicianStrings.ts', []);
const LANGS = ['en', 'ar', 'hi', 'ur', 'ml', 'tl', 'bn'];

test('every HR string has all 7 technician languages, non-empty', () => {
  for (const [key, row] of Object.entries(S.HR_STRINGS)) {
    for (const l of LANGS) assert.ok(String(row[l] || '').trim(), `${key} missing ${l}`);
  }
  assert.ok(Object.keys(S.HR_STRINGS).length >= 30);
});

test('hrText picks the technician language and falls back to en/ar for unknown copy', () => {
  assert.equal(S.hrText('ur', 'Leave Request', 'طلب إجازة'), 'چھٹی کی درخواست');
  assert.equal(S.hrText('ml', 'My Hours', 'ساعات عملي'), 'എന്റെ സമയം');
  assert.equal(S.hrText('bn', 'Unknown text', 'نص'), 'Unknown text');
  assert.equal(S.hrText('ar', 'Unknown text', 'نص'), 'نص');
});

test('HR screens use the technician language layer, have a picker, and every HrBi English text is either in the table or a known long-form fallback', () => {
  const page = readFileSync('src/technician/pages/TechnicianHRPageV2.tsx', 'utf8');
  const hours = readFileSync('src/technician/components/MyHoursPanel.tsx', 'utf8');
  for (const src of [page, hours]) {
    assert.doesNotMatch(src, /<Bi /);
    assert.match(src, /useHrText\(\)/);
  }
  assert.match(page, /<TechnicianLanguagePicker /);
  assert.match(page, /dir=\{isRTL \? 'rtl' : 'ltr'\}/);
  const used = [...(page + hours).matchAll(/<HrBi en=\{"([^"]*)"\}/g)].map((m) => m[1]);
  const missing = used.filter((t) => !S.HR_STRINGS[t]);
  // Long explanatory paragraphs stay en/ar for now (documented in the PR); everything else is translated.
  assert.ok(missing.every((t) => t.length > 60 || t === 'Trained for' || t === 'People AI Intent Router'), `untranslated: ${missing.join(' | ')}`);
  for (const t of [...(page + hours).matchAll(/ht\('([^']+)'\)/g)].map((m) => m[1])) assert.ok(S.HR_STRINGS[t], `ht key missing: ${t}`);
});

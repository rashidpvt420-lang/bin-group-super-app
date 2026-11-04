// Login page must not show certification or grade claims that BIN GROUP has not
// substantiated on this screen (audit 2026-11-04, fix 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const login = readFileSync(new URL('../../src/pages/LoginPage.tsx', import.meta.url), 'utf8');
const lang = readFileSync(new URL('../../src/context/LanguageContext.tsx', import.meta.url), 'utf8');

test('login page has no ISO 27001, INST-GRADE or UAE-SOV badges', () => {
  for (const claim of [/ISO 27001/, /INST-GRADE/, /UAE-SOV/]) assert.doesNotMatch(login, claim);
});

test('login translation keys no longer carry the ISO claim', () => {
  assert.doesNotMatch(lang, /'login\.iso_secure/);
});

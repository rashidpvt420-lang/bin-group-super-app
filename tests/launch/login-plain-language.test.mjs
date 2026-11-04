// Login copy uses plain words instead of jargon (audit 2026-11-04, fix 10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const login = readFileSync(new URL('../../src/pages/LoginPage.tsx', import.meta.url), 'utf8');
const lang = readFileSync(new URL('../../src/context/LanguageContext.tsx', import.meta.url), 'utf8');

test('login has no "Institutional SSO" divider', () => {
  assert.doesNotMatch(login, /INSTITUTIONAL SSO/i);
});

test('login title and subtitle use plain words in EN and AR', () => {
  assert.match(lang, /'login\.portal': 'Sign in'/);
  assert.match(lang, /'login\.portal': 'تسجيل الدخول'/);
  assert.doesNotMatch(lang, /'login\.portal': 'PARTNER PORTAL'/);
  assert.doesNotMatch(lang, /Authorized client and partner access only/);
  assert.match(lang, /'login\.authorized_only': 'Use the email and password for your BIN GROUP account\.'/);
});

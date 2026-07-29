import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../src/pages/LoginPage.tsx', import.meta.url),
  'utf8',
);

test('production login errors keep Firebase diagnostics out of the user alert', () => {
  assert.match(source, /\.\.\.\(import\.meta\.env\.DEV \? \{ diagnostic \} : \{\}\)/);
  assert.match(source, /\{import\.meta\.env\.DEV && notice\.diagnostic && \(/);
  assert.match(source, /console\.error\('\[AUTH_DIAGNOSTIC\]'/);

  assert.doesNotMatch(source, /The diagnostic details below show the exact blocker/);
  assert.doesNotMatch(source, /Enable the user in Firebase Authentication/);
  assert.doesNotMatch(source, /Use the Web API key from project/);
  assert.doesNotMatch(source, /Check Firestore rules, App Check enforcement/);
});

test('credential failures provide clear bilingual recovery guidance', () => {
  assert.match(source, /Email or password is incorrect\. Try again or use Forgot Password\./);
  assert.match(source, /البريد الإلكتروني أو كلمة المرور غير صحيحة/);
  assert.match(source, /Sign-in is temporarily unavailable\. Try again later or contact BIN GROUP support\./);
  assert.match(source, /تسجيل الدخول غير متاح مؤقتاً/);
  assert.match(source, /const toggleLoginLanguage = \(\) => \{\s*setNotice\(null\);\s*setLang\(lang === 'en' \? 'ar' : 'en'\);/);
  assert.match(source, /onClick=\{toggleLoginLanguage\}/);
});

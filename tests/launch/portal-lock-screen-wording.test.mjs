import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The ProtectedRoute lock screens call t('lock.*') with no inline fallback. Without these
// keys the LanguageContext humanises the key, so locked owners saw "Title Offline",
// "Desc Offline" and "Signout" (English even in Arabic mode).
const ctx = readFileSync(new URL('../../src/context/LanguageContext.tsx', import.meta.url), 'utf8');
const route = readFileSync(new URL('../../src/components/ProtectedRoute.tsx', import.meta.url), 'utf8');
const enBlock = ctx.slice(ctx.indexOf('en: {'), ctx.indexOf('ar: {'));
const arBlock = ctx.slice(ctx.indexOf('ar: {'));
const usedKeys = [...new Set([...route.matchAll(/\bt\('(lock\.[a-z_]+)'\)/g)].map((m) => m[1]))];

test('ProtectedRoute uses lock.* keys', () => {
  assert.ok(usedKeys.length >= 5, `expected lock keys, got ${usedKeys}`);
});

for (const key of usedKeys) {
  test(`${key} has English and Arabic copy`, () => {
    const en = enBlock.match(new RegExp(`'${key.replace('.', '\\.')}':\\s*'([^']+)'`));
    const ar = arBlock.match(new RegExp(`'${key.replace('.', '\\.')}':\\s*'([^']+)'`));
    assert.ok(en, `missing English copy for ${key}`);
    assert.ok(ar, `missing Arabic copy for ${key}`);
    assert.match(ar[1], /[\u0600-\u06FF]/, `Arabic copy for ${key} must be Arabic`);
    const humanised = key.split('.').pop().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    assert.notEqual(en[1], humanised, `${key} must not be the humanised key`);
  });
}

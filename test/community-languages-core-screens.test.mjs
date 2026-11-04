// Audit 2026-11-04 fix 9: Hindi, Urdu, Malayalam, Tagalog and Bengali on the owner and tenant core screens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMMUNITY_LANGUAGES, COMMUNITY_TRANSLATIONS, COMMUNITY_TRANSLATION_KEYS, LANGUAGE_NATIVE_NAMES } from '../src/i18n/communityLanguages.ts';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const CORE_FILES = [
  'src/owner/pages/OwnerSimpleDashboardPage.tsx',
  'src/tenant/pages/TenantSimpleDashboardPage.tsx',
  'src/owner/OwnerApp.tsx',
  'src/tenant/TenantApp.tsx',
];
const SCRIPT = { hi: /[\u0900-\u097F]/, ur: /[\u0600-\u06FF]/, ml: /[\u0D00-\u0D7F]/, bn: /[\u0980-\u09FF]/ };

test('every translation key used on the owner/tenant core screens exists in all five languages', async () => {
  const used = new Set();
  for (const file of CORE_FILES) {
    const src = await read(file);
    for (const m of src.matchAll(/\b(?:t|tx|label)\(\s*['"]([\w.-]+)['"]\s*,/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 60, `expected the core screens to use many keys, got ${used.size}`);
  for (const lang of COMMUNITY_LANGUAGES) {
    for (const key of used) assert.ok(COMMUNITY_TRANSLATIONS[lang][key]?.trim(), `${lang} missing ${key}`);
  }
});

test('inline English phrases on the core screens are translated too', async () => {
  const phrases = new Set();
  for (const file of [...CORE_FILES, 'src/owner/pages/OwnerSimpleDashboardPage.tsx']) {
    const src = await read(file);
    for (const m of src.matchAll(/\ben: '([^']+)'/g)) phrases.add(m[1]);
    for (const m of src.matchAll(/(?:phrase|copy)\('([^']+)'/g)) phrases.add(m[1]);
  }
  phrases.delete('2026 BIN GROUP PROPERTY OPERATIONS OS');
  for (const lang of COMMUNITY_LANGUAGES) {
    for (const p of phrases) assert.ok(COMMUNITY_TRANSLATIONS[lang][p], `${lang} missing phrase "${p}"`);
  }
});

test('translations are real: right script, not copies of English, no Arabic in Hindi/Malayalam/Bengali/Tagalog', () => {
  for (const lang of COMMUNITY_LANGUAGES) {
    const dict = COMMUNITY_TRANSLATIONS[lang];
    const values = COMMUNITY_TRANSLATION_KEYS.map((k) => dict[k]);
    assert.equal(values.filter((v) => !v || !v.trim()).length, 0, `${lang} has empty strings`);
    if (SCRIPT[lang]) {
      const native = values.filter((v) => SCRIPT[lang].test(v)).length;
      assert.ok(native / values.length > 0.9, `${lang}: only ${native}/${values.length} in native script`);
    }
    if (lang !== 'ur') assert.ok(!values.some((v) => /[\u0600-\u06FF]/.test(v)), `${lang} contains Arabic script`);
  }
  const tl = COMMUNITY_TRANSLATIONS.tl;
  const englishSame = COMMUNITY_TRANSLATION_KEYS.filter((k) => k.includes('.') ? false : tl[k] === k);
  assert.ok(englishSame.length <= 10, `Tagalog copies too much English: ${englishSame.join(', ')}`);
  assert.equal(tl['tenant.home.rent'], 'Upa');
  assert.equal(COMMUNITY_TRANSLATIONS.hi['owner.home.title'], 'मेरी संपत्तियाँ');
  assert.match(COMMUNITY_TRANSLATIONS.bn['tenant.home.responseWithin'], /\{\{minutes\}\}/);
  assert.equal(LANGUAGE_NATIVE_NAMES.ml, 'മലയാളം');
});

test('language context supports the new languages, persists them and never falls back to Arabic', async () => {
  const ctx = await read('src/context/LanguageContext.tsx');
  assert.match(ctx, /export type Language = "en" \| "ar" \| CommunityLanguage;/);
  assert.match(ctx, /SUPPORTED_LANGUAGES as string\[\]\)\.includes\(stored\)/);
  assert.match(ctx, /const phrase = \(en: string, ar: string\): string => \(lang === "ar" \? ar : community\?\.\[en\] \?\? en\);/);
  assert.match(ctx, /isRTL: lang === "ar"/);
  const controls = await read('src/components/PortalSessionControls.tsx');
  assert.match(controls, /data-testid=\{`\$\{role\}-language-picker`\}/);
  assert.match(controls, /SUPPORTED_LANGUAGES\.map/);
  const menu = await read('src/components/PortalHeaderMenu.tsx');
  assert.match(menu, /COMMUNITY_LANGUAGES\.filter/);
});

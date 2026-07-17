import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const ARABIC = /[\u0600-\u06FF]/;

const surfaces = [
  {
    name: 'Owner property onboarding shell',
    path: 'src/pages/PropertyOnboardingPage.tsx',
    language: /useLanguage\(\)/,
    branch: /lang\s*===\s*['"]ar['"]|isRTL\s*\?/,
  },
  {
    name: 'Asset and Mosque intake',
    path: 'src/components/onboarding/AssetProfileStep.tsx',
    language: /useLanguage\(\)/,
    branch: /lang\s*===\s*['"]ar['"]/,
  },
  {
    name: 'Owner payment summary',
    path: 'src/components/onboarding/PaymentSummaryStep.tsx',
    language: /useLanguage\(\)/,
    branch: /isRTL\s*\?\s*ar\s*:\s*en/,
  },
  {
    name: 'Admin security profile',
    path: 'apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx',
    language: /useLanguage\(\)/,
    branch: /isRTL\s*\?/,
  },
  {
    name: 'Admin application shell',
    path: 'apps/admin-panel/src/App.tsx',
    language: /useLanguage\(\)/,
    branch: /isRTL\s*\?|lang\s*===\s*['"]ar['"]/,
  },
];

test('launch-critical surfaces retain Arabic, language state and bilingual branches', async () => {
  for (const surface of surfaces) {
    const source = await read(surface.path);
    assert.match(source, surface.language, `${surface.name} does not use the language provider`);
    assert.match(source, surface.branch, `${surface.name} has no explicit Arabic branch`);
    assert.match(source, ARABIC, `${surface.name} contains no Arabic script`);
  }
});

test('launch-critical forms preserve RTL direction and bilingual blocking copy', async () => {
  const [onboarding, asset, payment, adminProfile] = await Promise.all([
    read('src/pages/PropertyOnboardingPage.tsx'),
    read('src/components/onboarding/AssetProfileStep.tsx'),
    read('src/components/onboarding/PaymentSummaryStep.tsx'),
    read('apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx'),
  ]);

  assert.match(onboarding, /direction:\s*isRTL\s*\?\s*['"]rtl['"]\s*:\s*['"]ltr['"]|dir=\{isRTL\s*\?\s*['"]rtl['"]\s*:\s*['"]ltr['"]\}/);
  assert.match(asset, /direction:\s*isRTL\s*\?\s*['"]rtl['"]\s*:\s*['"]ltr['"]|dir=\{isRTL\s*\?\s*['"]rtl['"]\s*:\s*['"]ltr['"]\}/);
  assert.match(payment, /direction:\s*isRTL\s*\?\s*['"]rtl['"]\s*:\s*['"]ltr['"]|dir=\{isRTL\s*\?\s*['"]rtl['"]\s*:\s*['"]ltr['"]\}/);
  assert.match(adminProfile, /dir=\{isRTL\s*\?\s*['"]rtl['"]\s*:\s*['"]ltr['"]\}/);

  assert.match(asset, /اسم المسجد مطلوب/);
  assert.match(asset, /المساحة الإجمالية المقاسة مطلوبة/);
  assert.match(payment, /تعليمات الدفع المؤسسية غير متاحة/);
  assert.match(payment, /مبلغ الدفع غير موجود/);
  assert.match(adminProfile, /ملف الأمان الشخصي/);
});

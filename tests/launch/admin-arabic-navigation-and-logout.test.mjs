import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../apps/admin-panel/src/components/Navigation.tsx', import.meta.url), 'utf8');

const bilingualLabels = [
  ['Design Studio Manager', 'مدير استوديو التصميم'],
  ['Sovereign Control', 'التحكم السيادي'],
  ['BIN Connect Inbox', 'صندوق وارد BIN Connect'],
  ['Public Launch Command', 'قيادة الإطلاق العام'],
  ['Pricing Matrix 2026', 'مصفوفة التسعير 2026'],
  ['Broker Attribution Queue', 'قائمة إسناد الوسطاء'],
  ['Tenant Unit Links', 'روابط وحدات المستأجرين'],
  ['Duty Command Center', 'مركز قيادة المناوبات'],
  ['WhatsApp Triage', 'فرز واتساب'],
  ['Vendor Command', 'قيادة الموردين'],
  ['PDPL Governance', 'حوكمة حماية البيانات الشخصية'],
  ['HR Command', 'قيادة الموارد البشرية'],
];

test('Admin navigation exposes explicit Arabic labels for launch-critical entries', () => {
  assert.match(source, /const navText = \(en: string, ar: string\) => \(isRTL \? ar : en\)/);
  for (const [english, arabic] of bilingualLabels) {
    assert.ok(source.includes(`navText('${english}', '${arabic}')`), `Missing bilingual Admin navigation label: ${english}`);
  }
  assert.match(source, /text: 'Tenant Services'/, 'Scheduled-services verifier compatibility marker is missing');
});

test('Owners route is not mislabeled as active tenants', () => {
  assert.match(source, /navText\('Owners', 'الملاك'\)[\s\S]{0,120}path: '\/owners'/);
  assert.doesNotMatch(source, /admin\.active_tenants[\s\S]{0,120}path: '\/owners'/);
});

test('Admin logout clears owner onboarding persistence instead of restoring it', () => {
  assert.match(source, /localStorage\.clear\(\)/);
  assert.doesNotMatch(source, /activeOnboarding/);
  assert.doesNotMatch(source, /setItem\('bin-group-onboarding-v3'/);
  assert.match(source, /setItem\('bin_language', currentLang\)/);
});

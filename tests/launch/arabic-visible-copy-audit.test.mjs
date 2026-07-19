import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const ARABIC = /[\u0600-\u06FF]/;

const highRiskSurfaces = [
  'src/components/onboarding/CompanyProfileStep.tsx',
  'src/components/onboarding/AssetProfileStep.tsx',
  'src/components/onboarding/PropertyLocationStep.tsx',
  'src/components/onboarding/ProofUploadStep.tsx',
  'src/components/onboarding/ContractSignatureStep.tsx',
  'src/components/onboarding/PaymentSummaryStep.tsx',
  'src/owner/components/OwnerProfileReadinessCard.tsx',
  'src/tenant/components/TenantProfileReadinessCard.tsx',
  'src/technician/pages/TechnicianProfilePage.tsx',
  'src/broker/pages/BrokerProfilePage.tsx',
  'apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx',
];

test('high-risk onboarding and five-profile surfaces retain Arabic branches and RTL direction', async () => {
  for (const path of highRiskSurfaces) {
    const source = await read(path);
    assert.match(source, ARABIC, `${path} contains no Arabic visible copy`);
    assert.match(source, /isRTL|lang\s*===\s*['"]ar['"]|copy\([^,]+,\s*['"][^'"]*[\u0600-\u06FF]/, `${path} has no Arabic language branch`);
    assert.match(source, /dir=\{isRTL \? ['"]rtl['"] : ['"]ltr['"]\}|direction:\s*isRTL \? ['"]rtl['"] : ['"]ltr['"]|flexDirection:\s*isRTL/, `${path} has no RTL layout contract`);
  }
});

test('Property Location no longer exposes the audited English-only control set', async () => {
  const source = await read('src/components/onboarding/PropertyLocationStep.tsx');
  for (const arabic of [
    'موقع العقار',
    'عنوان العقار',
    'خط العرض',
    'خط الطول',
    'رابط خرائط Google',
    'الرمز المكاني Plus Code',
    'البحث عن عنوان العقار',
    'حفظ الإحداثيات',
    'استخدام موقعي الحالي',
    'فتح خرائط Google',
    'الموقع موثّق',
    'الإرسال مقفل حتى المراجعة',
  ]) assert.ok(source.includes(arabic), `Property Location is missing Arabic copy: ${arabic}`);
  assert.match(source, /copy\('Latitude', 'خط العرض'\)/);
  assert.match(source, /copy\('Longitude', 'خط الطول'\)/);
  assert.match(source, /copy\('Find Property Address', 'البحث عن عنوان العقار'\)/);
});

test('Asset and Mosque intake translates categories and mandatory compliance controls', async () => {
  const source = await read('src/components/onboarding/AssetProfileStep.tsx');
  for (const arabic of ['سكني', 'تجاري', 'رعاية صحية', 'حكومي', 'ديني', 'ملف تشغيل المسجد الإلزامي', 'مناطق الوضوء', 'أيام الاحتفاظ']) {
    assert.ok(source.includes(arabic), `Asset/Mosque intake is missing Arabic copy: ${arabic}`);
  }
  assert.match(source, /properties\.map/);
  assert.match(source, /addProperty/);
  assert.match(source, /removeProperty/);
});

test('role shells translate audited labels, breadcrumbs and footers', async () => {
  const [tenant, technician] = await Promise.all([
    read('src/tenant/TenantApp.tsx'),
    read('src/technician/TechnicianApp.tsx'),
  ]);
  assert.match(tenant, /نظام BIN GROUP لتشغيل العقارات/);
  assert.match(tenant, /ملف المستأجر/);
  assert.match(technician, /الإثبات/);
  assert.match(technician, /منصة BIN GROUP للفنيين/);
  assert.match(technician, /breadcrumbArabic/);
});

test('Admin and Broker map technical states before displaying them in Arabic', async () => {
  const [admin, broker] = await Promise.all([
    read('apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx'),
    read('src/broker/pages/BrokerProfilePage.tsx'),
  ]);
  assert.match(admin, /statusLabel/);
  assert.match(admin, /eventLabel/);
  assert.match(admin, /targetLabel/);
  assert.match(admin, /استعادة المصادقة متعددة العوامل/);
  assert.match(broker, /localizedStatus/);
  assert.match(broker, /payoutReason/);
  assert.match(broker, /رخصة ريرا غير موثقة/);
});

test('portfolio contract and payment Arabic copy are tied to server-authoritative totals', async () => {
  const [contract, payment] = await Promise.all([
    read('src/components/onboarding/ContractSignatureStep.tsx'),
    read('src/components/onboarding/PaymentSummaryStep.tsx'),
  ]);
  assert.match(contract, /القيمة السنوية للمحفظة/);
  assert.match(contract, /لا تحتفظ BIN GROUP بأموال إيجار المالك/);
  assert.match(contract, /previewOwnerOnboardingQuote/);
  assert.match(payment, /خيارات دفع المحفظة/);
  assert.match(payment, /دفعة التعبئة الإلزامية 15٪/);
  assert.match(payment, /previewOwnerOnboardingQuote/);
  assert.match(payment, /portfolioPropertyCount/);
});

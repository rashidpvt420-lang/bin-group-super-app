import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('Phase 18 public Owner copy states the canonical inspection-first activation order in English and Arabic', async () => {
  const page = await read('src/pages/public/PublicMarketingPage.tsx');
  assert.ok(page.includes('property submission → BIN GROUP review → site inspection → final quotation → contract → payment → activation'));
  assert.ok(page.includes('تقديم العقار ← مراجعة BIN GROUP ← فحص ميداني ← عرض نهائي ← عقد ← دفع ← تفعيل'));
  assert.ok(page.includes('Receive the final verified quotation'));
  assert.ok(page.includes('Accept and OTP-sign the final contract'));
  assert.ok(page.includes('Pay the exact mobilisation amount'));
  assert.ok(page.includes('Admin verifies payment and activates'));
});

test('Phase 18 public Owner copy never advertises quote/contract/payment before physical verification', async () => {
  const [root, owner, profile] = await Promise.all([read('src/pages/public/PublicMarketingPage.tsx'), read('apps/owner-app/src/pages/public/PublicMarketingPage.tsx'), read('src/lib/companyProfile.ts')]);
  for (const source of [root, owner, profile]) {
    assert.doesNotMatch(source, /15% upfront/i);
    assert.doesNotMatch(source, /property details, instant quote, contract selection, 15% mobilization/i);
    assert.doesNotMatch(source, /details → quote and contract → physical inspections/i);
  }
  assert.ok(owner.includes('Inspection → final quote → signed contract → payment'));
  assert.ok(profile.includes('physical site inspection, final verified quotation, Owner contract acceptance, payment verification, and activation'));
  assert.ok(profile.includes('authoritative property pricing remains server-calculated from verified inputs rather than AI-generated'));
});

test('Phase 18 public pricing language distinguishes final verified pricing from pre-inspection estimates', async () => {
  const [root, owner] = await Promise.all([read('src/pages/public/PublicMarketingPage.tsx'), read('apps/owner-app/src/pages/public/PublicMarketingPage.tsx')]);
  assert.ok(root.includes("['Mobilization', '15% after required inspections']"));
  assert.ok(owner.includes("['Annual Maintenance Contracts', 'Final quote after inspection']"));
  assert.ok(owner.includes("['Mobilization', '15% only after final quote + signed contract']"));
});

test('Phase 18 Arabic and mobile public UI remain first-class', async () => {
  const [root, owner, company] = await Promise.all([read('src/pages/public/PublicMarketingPage.tsx'), read('apps/owner-app/src/pages/public/PublicMarketingPage.tsx'), read('src/pages/public/CompanyProfilePage.tsx')]);
  for (const source of [root, owner, company]) {
    assert.match(source, /direction: isRTL \? 'rtl' : 'ltr'/);
    assert.match(source, /xs:/);
  }
  assert.ok(root.includes('Switch language to Arabic'));
  assert.ok(owner.includes("language: 'English'"));
});

test('Phase 18 public contact support Terms and Privacy routes expose real BIN GROUP contact/legal surfaces', async () => {
  const [root, owner, support, terms, privacy] = await Promise.all([read('src/pages/public/PublicMarketingPage.tsx'), read('apps/owner-app/src/pages/public/PublicMarketingPage.tsx'), read('src/pages/public/SupportPage.tsx'), read('src/pages/public/TermsPage.tsx'), read('src/pages/public/PrivacyPage.tsx')]);
  for (const source of [root, owner, support]) {
    assert.ok(source.includes('+971 55 7474560'));
  }
  assert.ok(owner.includes('ceo@bin-groups.com'));
  assert.ok(support.includes("label('Contact BIN GROUP', 'تواصل مع BIN GROUP')"));
  assert.ok(support.includes("label('Request Support', 'اطلب الدعم')"));
  assert.ok(support.includes("label('Schedule Demo', 'احجز عرضاً توضيحياً')"));
  assert.ok(terms.includes("t('terms.title')"));
  assert.ok(privacy.includes("t('privacy.title')"));
});

test('Phase 18 public AI copy does not imply autonomous commercial authority', async () => {
  const [marketing, ai] = await Promise.all([read('src/pages/public/PublicMarketingPage.tsx'), read('src/components/SovereignAIChat.tsx')]);
  assert.ok(marketing.includes('AI triage'));
  assert.ok(ai.includes('Authoritative approvals, payments, and property records remain in the dashboard.'));
  assert.ok(ai.includes('allowLiveProvider'));
});

test('Phase 18 public inventory has truthful loading empty failure and success states', async () => {
  const page = await read('src/pages/public/PublicHomeDiscoveryPage.tsx');
  for (const token of ["'LOADING' | 'AVAILABLE' | 'EMPTY' | 'FAILED'", "inventoryState === 'FAILED'", 'public-home-load-failed', 'public-home-empty', 'zero verified public listings', 'CircularProgress']) assert.ok(page.includes(token), 'Missing public state ' + token);
});

test('Phase 18 public buttons navigate to real routes or are explicitly disabled', async () => {
  const [root, owner, support] = await Promise.all([read('src/pages/public/PublicMarketingPage.tsx'), read('apps/owner-app/src/pages/public/PublicMarketingPage.tsx'), read('src/pages/public/SupportPage.tsx')]);
  for (const route of ['/onboarding','/login']) assert.ok(root.includes(route));
  for (const route of ['/onboarding','/login','/company-profile']) assert.ok(owner.includes(route));
  assert.ok(owner.includes('<Button disabled fullWidth'));
  assert.ok(support.includes('href="/onboarding"'));
  assert.ok(support.includes('href="/request-demo"'));
});
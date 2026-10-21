// Rashid-confirmed company facts (Oct 21 2026): trade licence CN-5914744 issued
// 2025, public email ceo@bin-groups.com, "rooted in Al Ain" without a founding
// year, all 7 emirates. No address/hours/ISO certificate details yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ts = createRequire(import.meta.url)('typescript');
const sandbox = { exports: {}, String, Boolean, Array };
runInNewContext(ts.transpileModule(read('src/lib/companyProfile.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
const { DEFAULT_COMPANY_PROFILE, normalizeCompanyProfile } = sandbox.exports;

test('single confirmed public email, and stored wrong-domain email is corrected', () => {
  assert.equal(DEFAULT_COMPANY_PROFILE.contact.email, 'ceo@bin-groups.com');
  assert.equal(normalizeCompanyProfile({ contact: { email: 'owner@bin-group.com' } }).contact.email, 'ceo@bin-groups.com');
  for (const p of ['src/lib/companyProfile.ts', 'src/pages/public/CompanyProfilePage.tsx']) assert.doesNotMatch(read(p), /email: 'owner@bin-group\.com'/, p);
  assert.match(read('src/pages/public/CompanyProfilePage.tsx'), /email: 'ceo@bin-groups\.com'/);
});

test('trade licence CN-5914744 issued 2025 shown in EN and AR, no invented issuing authority', () => {
  const page = read('src/pages/public/CompanyProfilePage.tsx');
  assert.match(page, /Trade licence CN-5914744 \(issued 2025\)/);
  assert.match(page, /رخصة تجارية رقم CN-5914744 \(صادرة عام 2025\)/);
  assert.doesNotMatch(page, /available on request|متاحة عند الطلب/);
  assert.match(DEFAULT_COMPANY_PROFILE.licenseInfo, /CN-5914744 \(issued 2025\)/);
  assert.doesNotMatch(page + DEFAULT_COMPANY_PROFILE.licenseInfo, /DED|ADDED|Department of Economic/);
});

test('rooted in Al Ain without a founding year', () => {
  const all = read('src/lib/companyProfile.ts') + read('src/pages/public/CompanyProfilePage.tsx') + read('src/pages/public/PropertyPassportPublicPage.tsx');
  assert.doesNotMatch(all, /2010/);
  assert.match(DEFAULT_COMPANY_PROFILE.headline, /rooted in Al Ain/);
});

test('service areas cover all 7 emirates', () => {
  const areas = [...DEFAULT_COMPANY_PROFILE.serviceAreas];
  for (const e of ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain']) assert.ok(areas.includes(e), e);
});

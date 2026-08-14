import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('protected live launch audit rebuilds canonical five-role state after auth seeding', () => {
  const source = read('scripts/run-live-launch-audit.mjs');
  const authSeed = source.indexOf("'scripts/seed-e2e-auth.mjs'");
  const liveSeed = source.indexOf("'scripts/seed-live-role-test-data.mjs'");
  const evidence = source.indexOf("'scripts/run-critical-evidence.mjs'");
  assert.ok(authSeed >= 0, 'live audit must seed E2E Auth');
  assert.ok(liveSeed > authSeed, 'canonical live-role data must be rebuilt after Auth seeding');
  assert.ok(evidence > liveSeed, 'critical launch evidence must run only after canonical live-role state is restored');
});

test('strict live Playwright evidence is serialized and retry-free', () => {
  const source = read('playwright.config.ts');
  assert.match(source, /strictLiveMode/);
  assert.match(source, /workers:\s*strictLiveMode\s*\?\s*1\s*:\s*undefined/);
  assert.match(source, /retries:\s*strictLiveMode\s*\?\s*0\s*:/);
});

test('Admin hard-launch exact-route proof uses canonical Founder MFA', () => {
  const source = read('tests/e2e/hard-launch-routes.spec.ts');
  assert.match(source, /loginAdminWithRealMfa/);
  assert.match(source, /requireAdminMfaCredentials\('E2E_FOUNDER'\)/);
  assert.match(source, /ceo@bin-groups\.com/);
});

test('live launch audits reuse one real session per serial role suite', () => {
  for (const [path, contextName] of [
    ['tests/e2e/launch-audit-admin.spec.ts', 'adminContext'],
    ['tests/e2e/launch-audit-owner.spec.ts', 'ownerContext'],
    ['tests/e2e/launch-audit-tenant.spec.ts', 'tenantContext'],
    ['tests/e2e/launch-audit-technician.spec.ts', 'technicianContext'],
    ['tests/e2e/launch-audit-broker.spec.ts', 'brokerContext'],
  ]) {
    const source = read(path);
    assert.match(source, /test\.describe\.configure\(\{ mode: 'serial' \}\)/);
    assert.match(source, /test\.beforeAll\(async \(\{ browser \}\)/);
    assert.match(source, new RegExp(`${contextName} = await browser\\.newContext`));
    assert.doesNotMatch(source, /test\.beforeEach\(async \(\{ page \}\)/);
  }

  const adminSource = read('tests/e2e/launch-audit-admin.spec.ts');
  assert.match(adminSource, /await loginAdminWithRealMfa\(adminPage/);
});

test('launch fixtures preserve rules-authorized owner and tenant links', () => {
  const source = read('scripts/seed-live-role-test-data.mjs');
  assert.match(source, /db\.collection\('owners'\)\.doc\(ownerUid\)\.set/);
  assert.match(source, /db\.collection\('tenants'\)\.doc\(tenantUid\)\.set/);
  assert.match(source, /currentTenantId: tenantUid/);
  assert.match(source, /authUid: tenantUid/);
});

test('live role dashboards do not make policy-incompatible fallback reads', () => {
  const ownerSource = read('src/owner/pages/OwnerDashboardResolvedPage.tsx');
  const tenantSource = read('src/tenant/pages/TenantProfilePage.tsx');
  const correctionFixtureSource = read('scripts/prepare-tenant-correction-e2e.mjs');
  assert.doesNotMatch(ownerSource, /getCollectionDocs\('contracts', 'emailDelivery\.recipient'/);
  assert.match(tenantSource, /where\('currentTenantId', '==', user\.uid\)/);
  assert.match(tenantSource, /if \(deduplicated\.size === 0 && user\.email\)/);
  assert.match(tenantSource, /const canonicalPropertyIds = new Set/);
  assert.match(tenantSource, /\[userData\.propertyId\]/);
  assert.match(tenantSource, /filter\(\(propertyId\) => canonicalPropertyIds\.has\(propertyId\)\)/);
  assert.doesNotMatch(tenantSource, /userData\.assignedPropertyId/);
  assert.match(correctionFixtureSource, /canonical propertyId and unitId from the live-role fixture/);
  assert.match(correctionFixtureSource, /const legacyUnitRef = db\.collection\('units'\)\.doc\(`e2e-launch-unit-\$\{tenantUid\}`\)/);
  assert.match(correctionFixtureSource, /legacyUnitSnap\.data\(\)\?\.e2eLaunchSeed === true/);
  assert.doesNotMatch(correctionFixtureSource, /collection\('properties'\)\.doc\([^\n]+\)\.set/);
  assert.doesNotMatch(correctionFixtureSource, /collection\('units'\)\.doc\([^\n]+\)\.set/);
  assert.doesNotMatch(correctionFixtureSource, /const e2ePropertyId = 'e2e-launch-property'/);
});

test('Owner portfolio and Tenant unit pages use rule-provable canonical bindings', () => {
  const ownerSource = read('src/owner/pages/OwnerPropertiesPage.tsx');
  const tenantSource = read('src/tenant/pages/TenantUnitPage.tsx');

  assert.match(ownerSource, /where\('ownerId', '==', user\.uid\)/);
  assert.match(ownerSource, /where\('ownerEmail', '==', email\)/);
  assert.doesNotMatch(ownerSource, /where\('propertyId', '==', p\.id\)/);
  assert.match(ownerSource, /passportsByPropertyId/);

  assert.match(tenantSource, /const preferredUnitId = String\(user\?\.unitId \|\| ''\)\.trim\(\)/);
  assert.match(tenantSource, /const preferredPropertyId = String\(user\?\.propertyId \|\| ''\)\.trim\(\)/);
  assert.match(tenantSource, /getDoc\(doc\(db, 'units', preferredUnitId\)\)/);
  assert.match(tenantSource, /\|\| candidates\[0\] \|\| null/);
  assert.doesNotMatch(tenantSource, /snap\.docs\[0\]/);
});

test('Founder TOTP evidence is protected from near-boundary codes before deployment and in browser audits', () => {
  const helper = read('tests/e2e/helpers/adminMfa.ts');
  const serverHelper = read('scripts/lib/firebase-mfa-sign-in.mjs');
  const workflow = read('.github/workflows/firebase-production-deploy.yml');
  const preflight = read('scripts/verify-founder-totp-signin.mjs');

  assert.match(helper, /waitForFreshTotpWindow/);
  assert.match(helper, /waitForNextTotpWindow/);
  assert.match(helper, /two consecutive windows/);
  assert.match(serverHelper, /waitForFreshTotpWindow/);
  assert.match(serverHelper, /waitForNextTotpWindow/);
  assert.match(serverHelper, /after two consecutive TOTP windows/);
  assert.match(workflow, /Verify canonical Founder TOTP sign-in before deploy/);
  assert.match(preflight, /signInWithRequiredTotpMfa/);
  assert.match(preflight, /sensitiveValuesExcluded: true/);
});

test('production workflow preserves failed live-audit diagnostics and reports the Admin App Check app ID', () => {
  const workflow = read('.github/workflows/firebase-production-deploy.yml');
  const appCheck = read('scripts/ensure-appcheck.mjs');
  assert.match(workflow, /Upload failed live launch audit diagnostics/);
  assert.match(workflow, /live-launch-audit-diagnostics-/);
  assert.match(appCheck, /REACT_APP_ADMIN_FIREBASE_APP_ID/);
});

test('portal language proofs bind to explicit controls instead of substring selectors', () => {
  const cases = [
    ['tests/e2e/launch-audit-owner.spec.ts', 'owner-language-toggle'],
    ['tests/e2e/launch-audit-tenant.spec.ts', 'tenant-language-toggle'],
    ['tests/e2e/launch-audit-technician.spec.ts', 'technician-language-toggle'],
    ['tests/e2e/launch-audit-broker.spec.ts', 'broker-language-toggle'],
  ];
  for (const [path, testId] of cases) {
    const source = read(path);
    assert.match(source, new RegExp(`getByTestId\\('${testId}'\\)`));
    assert.doesNotMatch(source, /button:has-text\("AR"\)|button:has-text\("EN"\)/);
  }
});

test('live launch audit has a protected no-deploy workflow with always-on diagnostics', () => {
  const workflow = read('.github/workflows/live-launch-audit.yml');
  assert.match(workflow, /name:\s*Live Launch Audit/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /npm run test:e2e:launch-audit:live/);
  assert.match(workflow, /if:\s*\$\{\{ always\(\) \}\}/);
  assert.match(workflow, /launch_package\/artifacts\/\*\.json/);
  assert.doesNotMatch(workflow, /deploy-firebase-production\.mjs|npx firebase deploy/i);
});

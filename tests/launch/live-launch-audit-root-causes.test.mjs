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
  assert.doesNotMatch(correctionFixtureSource, /legacyUnitSnap\.data\(\)\?\.propertyId/);
  assert.doesNotMatch(correctionFixtureSource, /collection\('properties'\)\.doc\([^\n]+\)\.set/);
  assert.doesNotMatch(correctionFixtureSource, /collection\('units'\)\.doc\([^\n]+\)\.set/);
  assert.doesNotMatch(correctionFixtureSource, /const e2ePropertyId = 'e2e-launch-property'/);
});

test('Owner portfolio and Tenant unit pages use rule-provable canonical bindings', () => {
  const ownerSource = read('src/owner/pages/OwnerPropertiesPage.tsx');
  const tenantSource = read('src/tenant/pages/TenantUnitPage.tsx');

  assert.match(ownerSource, /where\('ownerId', '==', user\.uid\)/);
  assert.doesNotMatch(ownerSource, /where\('ownerEmail', '==', email\)/);
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

test('Phase 3 control repairs label icon-only controls and keep owner activation gate intact', () => {
  const ownerLanding = read('src/pages/OwnerLandingPage.tsx');
  const ownerApp = read('src/owner/OwnerApp.tsx');
  const tenantAi = read('src/tenant/pages/TenantAIConciergePage.tsx');
  const sharedAi = read('packages/shared/src/components/SovereignAIChat.tsx');
  const appAi = read('src/components/SovereignAIChat.tsx');
  const ownerAudit = read('tests/e2e/launch-audit-owner.spec.ts');
  const brokerAudit = read('tests/e2e/launch-audit-broker.spec.ts');

  assert.match(ownerLanding, /owner-landing-language-toggle/);
  assert.match(ownerLanding, /owner-landing-password-visibility/);
  assert.match(ownerApp, /owner-header-back/);
  assert.match(ownerApp, /owner-header-dashboard/);
  assert.match(tenantAi, /tenant-ai-restart/);
  assert.match(tenantAi, /tenant-ai-send/);
  assert.match(sharedAi, /aria-label="Open Sovereign AI chat"/);
  assert.match(appAi, /aria-label="Move or open Sovereign AI chat"/);
  assert.match(ownerAudit, /page\.goto\('\/owner\/activation'/);
  assert.doesNotMatch(ownerAudit, /owner AR\/EN switch works in shell[\s\S]{0,500}page\.goto\('\/owner\/dashboard'/);
  assert.match(brokerAudit, /waitForResolvedBrokerShell/);
  assert.match(brokerAudit, /Authenticating BIN-Groups Identity/);
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

test('public hosting enables cleanUrls so static legal pages keep SPA paths after reload', () => {
  const hosting = JSON.parse(read('firebase.json')).hosting;
  const appHost = hosting.find((entry) => entry.target === 'app');
  assert.equal(appHost?.cleanUrls, true);
});

test('static legal pages load boot-init so Arabic RTL applies outside the SPA', () => {
  const pages = [
    'public/terms-of-service.html',
    'public/privacy-policy.html',
    'public/terms.html',
    'public/privacy.html',
  ];
  for (const path of pages) {
    const html = read(path);
    assert.match(html, /src="\/boot-init\.js"/, `${path} must apply bin_language via boot-init`);
  }
  const boot = read('public/boot-init.js');
  assert.match(boot, /localStorage\.getItem\('bin_language'\)/);
  assert.match(boot, /document\.documentElement\.dir = lang === 'ar' \? 'rtl' : 'ltr'/);
});

test('Admin tenants registry labels icon-only row actions for launch a11y audit', () => {
  const source = read('apps/admin-panel/src/pages/tenants/TenantsManagementPage.tsx');
  assert.match(source, /aria-label=\{`Edit tenant/);
  assert.match(source, /aria-label=\{`Delete tenant/);
  assert.match(source, /aria-label=\{`Resend invitation for/);
  assert.match(source, /aria-label="Search existing tenant by email"/);
});

test('Admin live map audit does not treat KPI counts like "403 unresolved tickets" as HTTP failures', () => {
  const source = read('tests/e2e/launch-audit-admin.spec.ts');
  assert.match(source, /not KPI counts like "403 unresolved tickets"/);
  assert.match(source, /Forbidden\|Unauthorized\|Error/);
  assert.doesNotMatch(source, /const APPCHECK_HTTP = \/\\b401\\b\|\\b403\\b\|\\b429\\b\|too many requests\/i;/);
});

test('standalone live launch audit is manual-only and bound to an already deployed main SHA', () => {
  const workflow = read('.github/workflows/live-launch-audit.yml');
  const productionDeploy = read('.github/workflows/firebase-production-deploy.yml');

  assert.match(workflow, /name:\s*Live Launch Audit/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s*push:/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /node scripts\/verify-production-deployment\.mjs/);
  assert.match(workflow, /npm run test:e2e:launch-audit:live/);
  assert.match(workflow, /if:\s*\$\{\{ always\(\) \}\}/);
  assert.match(workflow, /launch_package\/artifacts\/\*\.json/);
  assert.doesNotMatch(workflow, /deploy-firebase-production\.mjs|npx firebase deploy/i);

  const deployAudit = productionDeploy.indexOf('npm run test:e2e:launch-audit:live');
  const deployCommand = productionDeploy.indexOf('node scripts/deploy-firebase-production.mjs');
  assert.ok(deployCommand >= 0, 'production workflow must retain the protected Firebase deploy');
  assert.ok(deployAudit > deployCommand, 'production live audit must remain after the Firebase deploy');
});


test('Phase 1 keeps one Owner Sovereign AI launcher and reserves BIN Connect interaction space', () => {
  const shell = read('src/components/AuthenticatedShell.tsx');
  const app = read('src/App.tsx');
  const ownerAi = read('src/owner/pages/OwnerAIIntelligencePage.tsx');
  const ai = read('src/components/SovereignAIChat.tsx');
  const binConnect = read('src/components/BinConnectChatBox.tsx');

  assert.match(shell, /shouldRenderSovereignAI = showChrome && isRolePortalRoute && Boolean\(user\?\.uid\)/);
  assert.match(shell, /shouldRenderSovereignAI[\s\S]*<SovereignAIChat/);
  assert.match(app, /function PublicSovereignAIEntry\(\)[\s\S]*if \(isRolePortalRoute\) return null;[\s\S]*<SovereignAIChat role="unknown"/);
  assert.match(app, /path="\/"[\s\S]*showChrome: false/);
  assert.doesNotMatch(ownerAi, /SovereignAIChat/);
  assert.match(ai, /reserveBinConnect/);
  assert.match(ai, /DRAG_THRESHOLD_PX = 7/);
  assert.match(ai, /suppressClickRef/);
  assert.match(ai, /disableSwipeToOpen/);
  assert.match(ai, /disableDiscovery/);
  assert.match(ai, /data-testid="sovereign-ai-mobile-drawer"/);
  assert.match(ai, /data-testid="sovereign-ai-desktop-drawer"/);
  assert.match(binConnect, /aria-label="BIN Connect chat"/);
  assert.doesNotMatch(binConnect, /SovereignAIChat/);
});

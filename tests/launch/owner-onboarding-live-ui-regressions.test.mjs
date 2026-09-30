import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

const requiredSystemKeys = [
  'electrical',
  'plumbing',
  'drainage',
  'pumps',
  'hvac',
  'districtCooling',
  'tank',
  'gen',
  'lifts',
  'fireAlarm',
  'firePump',
  'sira',
  'emergencyLighting',
  'accessControl',
  'bmu',
  'wasteMan',
  'bms',
  'iotSensors',
  'pool',
  'gym',
  'centralLPG',
  'greaseTrap',
  'majlisGarden',
  'solarIntegration',
  'evReadiness',
];

test('property-location fallback iframe is permitted by production CSP', async () => {
  const firebaseConfig = JSON.parse(await read('firebase.json'));
  const appHosting = firebaseConfig.hosting.find((entry) => entry.target === 'app');
  assert.ok(appHosting, 'app hosting target must exist');
  const globalHeaders = appHosting.headers.find((entry) => entry.source === '**');
  const csp = globalHeaders?.headers?.find((header) => header.key === 'Content-Security-Policy')?.value || '';
  assert.match(csp, /frame-src[^;]*https:\/\/www\.openstreetmap\.org/);

  const locationSource = await read('src/components/onboarding/PropertyLocationStep.tsx');
  assert.match(locationSource, /www\.openstreetmap\.org\/export\/embed\.html/);
  assert.match(locationSource, /component="iframe"/);
});

test('commercial review renders every selectable building system with visible theme-aware chips', async () => {
  const source = await read('src/components/onboarding/CommercialTermsStep.tsx');
  for (const key of requiredSystemKeys) {
    assert.match(source, new RegExp(`\\b${key}: \\{`), `missing commercial label for ${key}`);
  }
  assert.match(source, /color: 'text\.primary'/);
  assert.match(source, /borderColor: 'divider'/);
  assert.match(source, /water_tank: \{ en: 'Water Tank Sterilization'/);
});

test('property location persists canonical untrusted geo for review and submission', async () => {
  for (const path of [
    'src/components/onboarding/PropertyLocationStep.tsx',
    'apps/owner-app/src/components/onboarding/PropertyLocationStep.tsx',
  ]) {
    const source = await read(path);
    assert.match(source, /geo:\s*\{\s*\.\.\.geo,/);
    assert.match(source, /geo:\s*\{[\s\S]*?verified:\s*false,[\s\S]*?requiresGeoReview:\s*true,[\s\S]*?dispatchReady:\s*false,/);
    assert.match(source, /submittedGeo:\s*\{/);
  }
});

test('commercial onboarding fails closed and applies one portfolio service mode', async () => {
  const source = await read('src/components/onboarding/CommercialTermsStep.tsx');
  assert.match(source, /selectPlanForPortfolio/);
  assert.match(source, /properties\.forEach/);
  assert.match(source, /disabled=\{commercialBlocked\}/);
  assert.match(source, /pmRevenueMissing/);
  assert.match(source, /pmSupportedForPortfolio/);
  assert.match(source, /final verified re-quote and Owner final signature/);
});

test('systems and optional add-ons are scoped per property', async () => {
  const source = await read('src/components/onboarding/SystemsDataStep.tsx');
  const store = await read('src/store/onboardingStore.ts');
  assert.match(source, /activePropertyIndex/);
  assert.match(source, /activeProperty\.selectedAddOns/);
  assert.match(source, /updateProperty\(activePropertyIndex, \{ selectedAddOns: next \}\)/);
  assert.match(store, /selectedAddOns\?: string\[\]/);
  assert.match(store, /property\.selectedAddOns/);
});

test('Admin final pricing authority captures verified FM facts, zone and rate bands', async () => {
  const admin = await read('apps/admin-panel/src/components/admin/OwnerInspectionEvidenceDialog.tsx');
  const backend = await read('functions/ownerInspectionCompletion.ts');
  for (const token of ['Verified pricing zone', 'Verified Maintenance rate', 'Verified PM rate', 'Verified lifts', 'Verified HVAC count']) {
    assert.ok(admin.includes(token), `missing Admin pricing authority control: ${token}`);
  }
  for (const token of ['verifiedMaintenanceRate', 'verifiedManagementRate', 'districtCooling', 'fireAlarm', 'firePump', 'ratesVerified: true']) {
    assert.ok(backend.includes(token), `missing verified final pricing input: ${token}`);
  }
  assert.match(backend, /FINAL_VERIFIED_AFTER_ALL_SITE_VISITS/);
});

test('resumed Owner review fails closed on missing GPS and never renders misleading zero quote values', async () => {
  const source = await read('src/components/onboarding/ReviewBeforeSubmitStep.tsx');
  assert.match(source, /const missingGps = React\.useMemo/);
  assert.match(source, /Property GPS is missing\. Return to Property Location & GPS/);
  assert.match(source, /Fix property GPS/);
  assert.match(source, /disabled=\{missingGps \|\| quoteLoading \|\| quoteExpired \|\| Boolean\(quoteError\)\}/);
  assert.match(source, /quoteAvailable/);
  assert.match(source, /annualContractValue/);
  assert.match(source, /activationDeposit/);
  assert.match(source, /: '—'/);
});

test('review waits for restored Firebase Owner auth and never exposes raw unauthenticated state', async () => {
  const source = await read('src/components/onboarding/ReviewBeforeSubmitStep.tsx');
  assert.match(source, /onAuthStateChanged\(auth/);
  assert.match(source, /const \[authReady, setAuthReady\]/);
  assert.match(source, /signedInUid !== ownerAccount\.uid/);
  assert.match(source, /await auth\.currentUser\.getIdToken\(true\)/);
  // Unauthenticated/permission-denied are classified (session vs App Check vs account state);
  // see owner-review-quote-failure.test.mjs.
  assert.match(source, /classifyOwnerQuoteFailure\(\{ code: error\?\.code, idTokenRefreshed, appCheckTokenOk \}\)/);
  assert.match(source, /Your secure Owner session has expired or could not be restored\./);
  assert.match(source, /Sign in again/);
  assert.doesNotMatch(source, />Unauthenticated</);
});

test('login validates required credentials and maps common Firebase configuration failures', async () => {
  const source = await read('src/pages/LoginPage.tsx');
  assert.match(source, /code === 'auth\/missing-email'/);
  assert.match(source, /code === 'auth\/operation-not-allowed'/);
  assert.match(source, /code === 'auth\/unauthorized-domain'/);
  assert.match(source, /code === 'auth\/invalid-api-key'/);
  assert.match(source, /if \(!normalizedEmail\)/);
  assert.match(source, /if \(!\/\^\\S\+@\\S\+\\\.\\S\+\$\/\.test\(normalizedEmail\)\)/);
  assert.match(source, /if \(!password\)/);
  assert.match(source, /Enter your email address and try again\./);
  assert.match(source, /Secure sign-in is not authorized from this web address\./);
});

test('portal profile verification refreshes Auth and App Check before declaring account unavailable', async () => {
  const source = await read('src/context/RoleContext.tsx');
  assert.match(source, /PROFILE_READ_MAX_ATTEMPTS = 4/);
  assert.match(source, /getToken as getAppCheckToken/);
  assert.match(source, /await currentUser\.getIdToken\(true\)/);
  assert.match(source, /await getAppCheckToken\(appCheck, true\)/);
  assert.match(source, /readOwnProfileWithRecovery/);
  assert.match(source, /permission-denied/);
  assert.match(source, /unauthenticated/);
  assert.match(source, /Connectivity restored; retrying secure account verification/);
  assert.match(source, /setStatus\('profile_unavailable'\)/);
  assert.doesNotMatch(
    source,
    /profile_unavailable[\s\S]{0,500}setStatus\('active'\)/,
    'transport recovery must never unlock a portal without a verified server profile',
  );
});

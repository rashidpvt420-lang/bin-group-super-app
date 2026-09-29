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

test('commercial terms enforce one portfolio mode, protected quote readiness and inspection-first payment wording', async () => {
  const source = await read('src/components/onboarding/CommercialTermsStep.tsx');
  assert.match(source, /properties\.forEach\(\(_, index\) => updateProperty\(index, data\)\)/);
  assert.match(source, /portfolioPmSupported/);
  assert.match(source, /missingPmBasis/);
  assert.match(source, /invalidQuote/);
  assert.match(source, /disabled=\{!canConfirm\}/);
  assert.match(source, /After every site visit and the final verified Owner signature/);
  assert.match(source, /Array\.isArray\(property\.selectedAddOns\)/);

  const dedicated = await read('apps/owner-app/src/components/onboarding/CommercialTermsStep.tsx');
  assert.match(dedicated, /plan\.id === 'PM' \? 'pm_only' : 'both'/);
  assert.match(dedicated, /properties\.forEach\(\(_, index\) => updateProperty\(index, data\)\)/);
  assert.match(dedicated, /disabled=\{!canConfirm\}/);
});

test('systems page keeps optional add-ons property-scoped and derives required scopes from real systems', async () => {
  const source = await read('src/components/onboarding/SystemsDataStep.tsx');
  assert.match(source, /activeProperty\.selectedAddOns/);
  assert.match(source, /property\?\.fireAlarm === true \|\| property\?\.firePump === true/);
  assert.match(source, /property\?\.tank === true/);
  assert.match(source, /property\?\.hvac === true/);
  assert.match(source, /Number\(property\?\.lifts \|\| 0\) > 0/);
  assert.doesNotMatch(source, /BASE_REQUIRED_STACK_IDS/);
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
  assert.match(source, /code\.includes\('unauthenticated'\)/);
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

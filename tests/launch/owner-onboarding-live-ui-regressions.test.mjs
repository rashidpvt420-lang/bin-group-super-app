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

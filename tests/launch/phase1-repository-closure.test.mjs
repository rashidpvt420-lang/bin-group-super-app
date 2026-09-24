import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const retiredPaths = [
  'approve_onboarding.cjs',
  'firebase-proof-fix.mjs',
  'fix_auth.js',
  'fix_lang.js',
  'fix-map-fallback.cjs',
  'patch-routes.js',
  'qa-step2-owner-onboarding.js',
  'rest_audit.js',
  'rest_dump.js',
  'translate.js',
  'verify_mosque.cjs',
  'scripts/apply-five-role-business-evidence-fixes-legacy.mjs',
  '.github/workflows/persist-owner-app-payment-session.yml',
  'scripts/harden-owner-app-payment-session.mjs',
  '.github/workflows/persist-admin-payment-approval.yml',
  'scripts/harden-admin-payment-approval.mjs',
  '.github/workflows/persist-firestore-rules.yml',
  '.github/workflows/sync-five-profile-hardening.yml',
  '.github/workflows/revert-red-launch-suite-728.yml',
  'src/owner/pages/OwnerUnitsPage.tsx',
  'src/lib/offlineSync.ts',
  'apps/owner-app/src/lib/offlineSync.ts',
];

test('Phase 1 retired local authorities cannot re-enter the repository', () => {
  for (const path of retiredPaths) {
    assert.equal(existsSync(path), false, `${path} must remain retired`);
  }
});

test('legacy standalone Owner package is explicitly non-authoritative', () => {
  const firebase = read('firebase.json');
  const capacitor = read('capacitor.config.ts');
  const marker = read('apps/owner-app/LEGACY_RUNTIME.md');
  assert.doesNotMatch(firebase, /apps\/owner-app\/build/);
  assert.doesNotMatch(capacitor, /apps\/owner-app/);
  assert.match(marker, /not.*production authority|not.*production runtime/i);
  assert.match(marker, /src\/owner\/OwnerApp\.tsx/);
});

test('root Firebase Messaging worker uses generated build-time configuration', () => {
  const worker = read('public/firebase-messaging-sw.js');
  const generator = read('scripts/write-root-firebase-messaging-config.mjs');
  const pkg = JSON.parse(read('package.json'));
  assert.match(worker, /importScripts\('\/firebase-messaging-config\.js'\)/);
  assert.match(worker, /firebase\.initializeApp\(self\.__BIN_GROUP_FIREBASE_CONFIG\)/);
  assert.doesNotMatch(worker, /apiKey\s*:/);
  assert.doesNotMatch(worker, /appId\s*:/);
  assert.match(generator, /VITE_FIREBASE_API_KEY/);
  assert.match(generator, /VITE_FIREBASE_APP_ID/);
  assert.match(pkg.scripts.prebuild, /write-root-firebase-messaging-config\.mjs/);
});


test('canonical Owner unit registry is the sole runtime units authority', () => {
  const ownerApp = read('src/owner/OwnerApp.tsx');
  assert.match(ownerApp, /<Route path="\/units" element={<OwnerUnitRegistryPage \/>} \/>/);
  assert.match(ownerApp, /<Route path="\/legacy-units" element={<Navigate to="\/owner\/units" replace \/>} \/>/);
  assert.doesNotMatch(ownerApp, /OwnerUnitsPage/);
});

test('QR verification enrichment failures are observable instead of silently swallowed', () => {
  const qr = read('functions/qrSecurity.ts');
  assert.doesNotMatch(qr, /catch\s*\([^)]*\)\s*\{\s*\}/);
  assert.match(qr, /Property enrichment lookup failed/);
  assert.match(qr, /Unit enrichment lookup failed/);
});

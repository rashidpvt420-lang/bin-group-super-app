import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const backend = read('functions/technicianInstallationBinding.ts');
const contractSource = read('functions/technicianInstallationContract.ts');
const lifecycle = read('functions/index.ts');
const bridge = read('android/app/src/main/java/ae/bingroups/superapp/FirebaseAppCheckBridgePlugin.java');
const gradle = read('android/app/build.gradle');
const firebase = read('src/lib/firebase.ts');
const client = read('src/technician/utils/technicianInstallationBinding.ts');
const job = read('src/technician/pages/TechnicianJobDetailPage.tsx');
const offline = read('src/technician/utils/offlineJobActions.ts');
const runtime = read('functions/runtime.ts');
const docs = read('docs/TECHNICIAN_INSTALLATION_BINDING.md');
const androidConfigInjector = read('scripts/inject-android-google-services.mjs');

function loadContract() {
  const output = ts.transpileModule(contractSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
  }).outputText;
  const module = { exports: {} };
  const evaluate = new Function('exports', 'module', output);
  evaluate(module.exports, module);
  return module.exports;
}

const contract = loadContract();
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const ANDROID_APP_ID = '1:123413252227:android:36feeed4a78c1dcf99f3b6';
const WEB_APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';

test('01 native proof checks the Google Play installer and current Play delivery signer', () => {
  const proofStart = bridge.indexOf('public void getInstallationBindingProof');
  const getId = bridge.indexOf('FirebaseInstallations.getInstance()', proofStart);
  assert.ok(proofStart >= 0 && getId > proofStart);
  const guard = bridge.slice(proofStart, getId);
  assert.match(guard, /installerState\(\)/);
  assert.match(guard, /"I_OK"\.equals\(installer\)/);
  assert.match(guard, /signingState\(\)/);
  assert.match(guard, /"S_OK"\.equals\(signer\)/);
});

test('02 native Firebase Installation ID is SHA-256 hashed before crossing the bridge', () => {
  assert.match(bridge, /FirebaseInstallations\.getInstance\(\)[\s\S]*\.getId\(\)/);
  assert.match(bridge, /String installationHash = sha256\(firebaseInstallationId\)/);
  assert.match(bridge, /result\.put\("installationHash", installationHash\)/);
  assert.doesNotMatch(bridge, /result\.put\("(?:firebase)?InstallationId"/i);
});

test('03 native hashing fails closed and never logs installation identity material', () => {
  assert.match(bridge, /INSTALLATION_HASH_FAILURE/);
  assert.match(bridge, /INSTALLATION_ID_UNAVAILABLE/);
  assert.doesNotMatch(bridge, /Log\.[a-z]+\([^\n]*(?:firebaseInstallationId|installationHash)/i);
  assert.doesNotMatch(bridge, /System\.out\.print(?:ln)?\([^\n]*(?:firebaseInstallationId|installationHash)/i);
});

test('04 client platform detection cannot create proof without the protected native bridge', () => {
  assert.match(firebase, /getInstallationBindingProof/);
  assert.match(firebase, /Native Android installation-binding bridge plugin unavailable/);
  assert.match(client, /registerTechnicianDevice\(\{ installationHash \}\)/);
  assert.doesNotMatch(client, /platform:\s*['"]android['"]/);
});

test('05 registration requires authenticated App Check-protected callable execution', () => {
  assert.match(backend, /registerTechnicianDevice = onCall/);
  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /request\.auth\?\.uid/);
  assert.match(backend, /assertVerifiedNativeAndroidAppCheck\(request\)/);
});

test('06 web or reCAPTCHA App Check identity cannot register Android physical evidence', () => {
  assert.equal(contract.isVerifiedAndroidAppCheckAppId(WEB_APP_ID), false);
  assert.equal(contract.isVerifiedAndroidAppCheckAppId(''), false);
  assert.match(backend, /request\?\.app\?\.appId/);
  assert.match(backend, /production Android Play Integrity App Check identity is required/);
});

test('07 configured Android App Check identity is matched exactly when supplied', () => {
  assert.equal(contract.isVerifiedAndroidAppCheckAppId(ANDROID_APP_ID, ANDROID_APP_ID), true);
  assert.equal(
    contract.isVerifiedAndroidAppCheckAppId(ANDROID_APP_ID, '1:123413252227:android:0000000000000000'),
    false,
  );
  assert.match(backend, /process\.env\.TECHNICIAN_ANDROID_FIREBASE_APP_ID/);
  assert.match(contractSource, /1:123413252227:android:36feeed4a78c1dcf99f3b6/);
  assert.match(androidConfigInjector, /EXPECTED_ANDROID_APP_ID = '1:123413252227:android:36feeed4a78c1dcf99f3b6'/);
  assert.match(androidConfigInjector, /androidAppId !== EXPECTED_ANDROID_APP_ID/);
});

test('08 only the production project Android App Check namespace is accepted', () => {
  assert.equal(contract.isVerifiedAndroidAppCheckAppId(ANDROID_APP_ID), true);
  assert.equal(contract.isVerifiedAndroidAppCheckAppId('1:999999999999:android:abcdef0123456789'), false);
  assert.equal(contract.isVerifiedAndroidAppCheckAppId('1:123413252227:ios:abcdef0123456789'), false);
});

test('09 an account without a secure hash receives initial registration', () => {
  assert.equal(contract.classifyInstallationRegistration('', undefined, HASH_A), 'INITIAL_REGISTRATION');
});

test('10 the same SHA-256 installation registration is idempotent', () => {
  assert.equal(contract.classifyInstallationRegistration(HASH_A, HASH_A, HASH_A), 'IDEMPOTENT_REGISTRATION');
  assert.match(backend, /registration: "IDEMPOTENT"/);
});

test('11 a second different installation cannot silently replace the first', () => {
  assert.equal(contract.classifyInstallationRegistration(HASH_A, HASH_A, HASH_B), 'REJECTED_ROTATION');
  assert.match(backend, /different Technician installation is already registered/);
  assert.match(backend, /"failed-precondition"/);
});

test('12 conflicting users and technicians hashes fail closed', () => {
  assert.equal(contract.classifyInstallationRegistration(HASH_A, HASH_B, HASH_A), 'INCONSISTENT_REGISTRATION');
  assert.match(backend, /Controlled administrative repair is required/);
});

test('13 users and technicians registration writes are atomic and canonical', () => {
  const transactionStart = backend.indexOf('db.runTransaction');
  const transactionEnd = backend.indexOf('} catch (error: any)', transactionStart);
  const transaction = backend.slice(transactionStart, transactionEnd);
  assert.match(transaction, /transaction\.set\(userRef, registration, \{ merge: true \}\)/);
  assert.match(transaction, /transaction\.set\(technicianRef, registration, \{ merge: true \}\)/);
  for (const field of [
    'deviceRegistered: true',
    'registeredInstallationHash: installationHash',
    'registeredDevicePlatform: "android"',
    'deviceRegisteredAt: registeredAt',
  ]) assert.ok(transaction.includes(field), `missing atomic field: ${field}`);
  assert.match(transaction, /FieldValue\.serverTimestamp\(\)/);
  assert.doesNotMatch(transaction, /await\s+(?:userRef|technicianRef)\.(?:set|update)/);
});

test('14 initial registration and rejected rotation use server audit records without raw IDs', () => {
  assert.match(backend, /transaction\.create\(auditRef/);
  assert.match(backend, /TECHNICIAN_DEVICE_REGISTERED/);
  assert.match(backend, /TECHNICIAN_DEVICE_ROTATION_REJECTED/);
  assert.doesNotMatch(backend, /firebaseInstallationId|rawInstallationId/);
});

test('15 ARRIVED re-reads current profiles and rejects cross-account queue replay', () => {
  const arrival = backend.slice(backend.indexOf('resolveTechnicianArrivalBinding'));
  assert.match(arrival, /queuedTechnicianId && queuedTechnicianId !== authUid/);
  assert.match(arrival, /params\.transaction\.get\(userRef\)/);
  assert.match(arrival, /params\.transaction\.get\(technicianRef\)/);
  assert.match(arrival, /different Technician account/);
});

test('16 physical ARRIVED requires assignment, matching hash, Android registration, and Android App Check', () => {
  const arrival = backend.slice(backend.indexOf('resolveTechnicianArrivalBinding'));
  assert.match(arrival, /params\.assignedTechnicianId !== authUid/);
  assert.match(arrival, /decision !== "IDEMPOTENT_REGISTRATION"/);
  assert.match(arrival, /role\(user\.registeredDevicePlatform\) !== "android"/);
  assert.match(arrival, /role\(technician\.registeredDevicePlatform\) !== "android"/);
  assert.match(arrival, /assertVerifiedNativeAndroidAppCheck\(params\.request\)/);
});

test('17 GPS and physical-device fields are server-derived; client physicalDeviceBound has no authority', () => {
  assert.match(lifecycle, /accuracy > 100/);
  assert.match(lifecycle, /distanceKm\(\{ lat, lng \}, propertyGeo\) > 0\.25/);
  assert.match(lifecycle, /physicalDeviceBound = arrivalBinding\.physicalDeviceBound/);
  assert.match(lifecycle, /arrivalInstallationHash = arrivalBinding\.arrivalInstallationHash/);
  assert.match(lifecycle, /arrivalDevicePlatform = arrivalBinding\.arrivalDevicePlatform/);
  assert.doesNotMatch(lifecycle, /physicalDeviceBound\s*=\s*request\.data/);
  assert.doesNotMatch(job, /physicalDeviceBound/);
});

test('18 protected browser fixtures remain functional-only and cannot become physical evidence', () => {
  assert.equal(contract.protectedBrowserFixtureId('protected-e2e-browser'), 'protected-e2e-browser');
  assert.equal(contract.protectedBrowserFixtureId(HASH_A), null);
  assert.match(backend, /arrivalEvidenceMode: "BROWSER_FUNCTIONAL_ONLY"/);
  assert.match(backend, /physicalDeviceBound: false/);
  assert.match(lifecycle, /arrivalInstallationHash = FieldValue\.delete\(\)/);
  assert.match(lifecycle, /arrivalDevicePlatform = FieldValue\.delete\(\)/);
});

test('19 queued arrival carries only hashed binding and is revalidated for identity, age, GPS, and geofence', () => {
  assert.match(offline, /INSTALLATION_HASH_RE\.test\(installationHash\)/);
  assert.match(offline, /queuedTechnicianId/);
  assert.match(offline, /capturedAtMs/);
  assert.match(offline, /await callable\(\{[\s\S]*queuedTechnicianId:/);
  assert.match(lifecycle, /serverNowMs - capturedAtMs > 15 \* 60_000/);
  assert.match(lifecycle, /resolveTechnicianArrivalBinding\(\{/);
  assert.match(job, /installationHash/);
  assert.doesNotMatch(job, /firebaseInstallationId|rawInstallationId/);
});

test('20 release contract documents reinstall fail-closed behavior and uses Android versionCode 9', () => {
  assert.match(docs, /Reinstalling the app or clearing app data can produce a new Firebase/);
  assert.match(docs, /never silently replaces an existing secure digest/);
  assert.match(docs, /separate, controlled administrative/);
  assert.match(gradle, /versionCode\s+9\b/);
  assert.match(gradle, /versionName\s+"1\.0"/);
  assert.match(gradle, /firebase-installations/);
  assert.match(runtime, /registerTechnicianDevice/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const [
  identity,
  technicianApp,
  jobDetail,
  offline,
  server,
  runtime,
  verifier,
  bridge,
  gradle,
  browserFixture,
] = await Promise.all([
  read('src/lib/installationIdentity.ts'),
  read('src/technician/TechnicianApp.tsx'),
  read('src/technician/pages/TechnicianJobDetailPage.tsx'),
  read('src/technician/utils/offlineJobActions.ts'),
  read('functions/technicianInstallationBinding.ts'),
  read('functions/runtime.ts'),
  read('scripts/verify-technician-physical-evidence.mjs'),
  read('android/app/src/main/java/ae/bingroups/superapp/FirebaseAppCheckBridgePlugin.java'),
  read('android/app/build.gradle'),
  read('tests/e2e/business-technician.spec.ts'),
]);

test('real Android installation identity is Firebase Installations ID reduced to SHA-256', () => {
  assert.match(identity, /getInstallations/);
  assert.match(identity, /getId\(getInstallations\(app\)\)/);
  assert.match(identity, /Capacitor\.isNativePlatform\(\)/);
  assert.match(identity, /Capacitor\.getPlatform\(\) === 'android'/);
  assert.match(identity, /subtle\.digest\('SHA-256'/);
  assert.match(identity, /\^\[0-9a-f\]\{64\}\$/);
  assert.doesNotMatch(identity, /setItem\([^\n]*rawInstallationId/);
  assert.doesNotMatch(identity, /console\.[a-z]+\([^\n]*rawInstallationId/i);
});

test('device registration is preceded by native Play Integrity App Check refresh', () => {
  const refreshIndex = identity.indexOf('await forceNativeAppCheckRefresh()');
  const registerIndex = identity.indexOf("httpsCallable(functions, 'registerTechnicianDevice')");
  assert.ok(refreshIndex >= 0, 'native App Check refresh is required');
  assert.ok(registerIndex > refreshIndex, 'registration must happen after native App Check refresh');
  assert.match(technicianApp, /syncTechnicianDeviceRegistration\(\)/);
});

test('native bridge refuses token delivery unless installer and current Play signer are trusted', () => {
  assert.match(bridge, /"com\.android\.vending"\.equals\(installer\) \? "I_OK"/);
  assert.match(bridge, /EXPECTED_PLAY_SIGNING_SHA256/);
  assert.match(bridge, /!"I_OK"\.equals\(installer\)/);
  assert.match(bridge, /!"S_OK"\.equals\(signer\)/);
  assert.match(bridge, /PLAY_INSTALLATION_UNVERIFIED/);
  const gate = bridge.indexOf('String playInstallFailure = trustedPlayInstallFailureCode()');
  const token = bridge.lastIndexOf('FirebaseAppCheck.getInstance()');
  assert.ok(gate >= 0 && token > gate, 'Google Play installer/signer gate must run before App Check token retrieval');
});

test('web or reCAPTCHA App Check identity cannot register physical Android evidence', () => {
  assert.match(server, /enforceAppCheck: true/);
  assert.match(server, /request\?\.app\?\.appId/);
  assert.match(server, /ANDROID_APP_ID_RE/);
  assert.match(server, /android:\[a-f0-9\]\+\$/);
  assert.match(server, /verified Firebase Android App Check identity is required/);
  assert.doesNotMatch(server, /platform === "android"\)\s*return true/);
});

test('Technician device registration atomically updates both canonical profile documents', () => {
  assert.match(server, /export const registerTechnicianDevice = onCall/);
  assert.match(server, /db\.runTransaction/);
  assert.match(server, /transaction\.set\(userRef, registration, \{ merge: true \}\)/);
  assert.match(server, /transaction\.set\(technicianRef, registration, \{ merge: true \}\)/);
  assert.match(server, /deviceRegistered: true/);
  assert.match(server, /registeredInstallationHash: installationHash/);
  assert.match(server, /registeredDevicePlatform: platform/);
  assert.match(server, /registeredAppCheckAppId: appCheckAppId/);
  assert.match(server, /deviceRegisteredAt: firstRegisteredAt/);
});

test('same installation is idempotent while silent device takeover fails closed', () => {
  assert.match(server, /const initialRegistration = hashes\.length === 0/);
  assert.match(server, /TECHNICIAN_DEVICE_REGISTRATION_IDEMPOTENT/);
  assert.match(server, /differentExistingHash/);
  assert.match(server, /different-platform/);
  assert.match(server, /different-app-check-identity/);
  assert.match(server, /Controlled device re-registration is required/);
  assert.match(server, /TECHNICIAN_DEVICE_ROTATION_REJECTED/);
});

test('ARRIVED derives physicalDeviceBound on the server only after protected lifecycle verification', () => {
  assert.match(server, /delete incoming\.physicalDeviceBound/);
  assert.match(server, /requestedStatus !== "ARRIVED"/);
  assert.match(server, /preflightRegisteredInstallation/);
  assert.match(server, /securedUpdateTicketLifecycle/);
  assert.match(server, /persistArrivalBinding/);
  assert.match(server, /assignedTechnicianId\(ticket\) !== uid/);
  assert.match(server, /ticket\.gpsVerified !== true/);
  assert.match(server, /onSiteVerification\)\.toUpperCase\(\) !== "GPS_VERIFIED"/);
  assert.match(server, /physicalDeviceBound: true/);
  assert.match(server, /arrivalInstallationHash: installationHash/);
  assert.match(server, /arrivalDevicePlatform: "android"/);

  const securedLifecycle = server.indexOf('const lifecycleResult = await securedHandler');
  const binding = server.indexOf('await persistArrivalBinding');
  assert.ok(securedLifecycle >= 0 && binding > securedLifecycle, 'server binding must follow successful protected ARRIVED lifecycle validation');
});

test('arrival installation hash must match both Technician profile records and Android App Check identity', () => {
  assert.match(server, /userHash !== installationHash/);
  assert.match(server, /technicianHash !== installationHash/);
  assert.match(server, /registeredDevicePlatform\)\.toLowerCase\(\) !== "android"/);
  assert.match(server, /registeredAppCheckAppId\) !== appCheckAppId/);
  assert.match(server, /installation does not match the protected registered Android installation/);
});

test('GPS accuracy and property geofence remain fail closed before physical binding', () => {
  assert.match(server, /MAX_GPS_ACCURACY_METERS = 100/);
  assert.match(server, /MAX_PROPERTY_DISTANCE_METERS = 250/);
  assert.match(server, /accuracy <= 0 \|\| accuracy > MAX_GPS_ACCURACY_METERS/);
  assert.match(server, /propertyDistanceMeters > MAX_PROPERTY_DISTANCE_METERS/);
  assert.match(server, /Arrival location is outside the 250 metre property geofence/);
});

test('real Technician ARRIVED UI sends current protected installation identity with fresh GPS', () => {
  assert.match(jobDetail, /syncTechnicianDeviceRegistration\(\)/);
  assert.match(jobDetail, /Physical arrival requires the Google Play-installed BIN GROUP Android app/);
  assert.match(jobDetail, /getVerifiedArrivalPosition\(\)/);
  assert.match(jobDetail, /lifecyclePayload\.arrivalInstallationHash = installationIdentity\.installationHash/);
  assert.match(jobDetail, /lifecyclePayload\.arrivalDevicePlatform = installationIdentity\.platform/);
  assert.match(jobDetail, /lifecyclePayload\.arrivalLocation = arrivalLocation/);
});

test('offline queue preserves hashed arrival identity but never auto-replays physical ARRIVED', () => {
  assert.match(jobDetail, /getCachedAndroidInstallationIdentity\(\)/);
  assert.match(jobDetail, /arrivalInstallationHash: cachedIdentity\?\.installationHash/);
  assert.match(offline, /arrivalInstallationHash/);
  assert.match(offline, /arrivalDevicePlatform/);
  assert.match(offline, /return \['EN_ROUTE', 'IN_PROGRESS'\]\.includes\(status\)/);
  assert.match(offline, /auth\.currentUser\?\.uid/);
  assert.match(offline, /action\.technicianId !== currentUid/);
  assert.match(offline, /technician-mismatch/);
});

test('browser functional fixture remains separate and cannot masquerade as physical Android registration', () => {
  assert.match(browserFixture, /protected-e2e-browser/);
  assert.doesNotMatch(identity, /protected-e2e-browser/);
  assert.doesNotMatch(server, /protected-e2e-browser/);
  assert.match(server, /requireAndroidAppCheck/);
});

test('physical evidence verifier remains strict and is not weakened by runtime producer repair', () => {
  assert.match(verifier, /physicalDeviceBound === true/);
  assert.match(verifier, /gpsVerified === true/);
  assert.match(verifier, /GPS_VERIFIED/);
  assert.match(verifier, /arrivalInstallationHash/);
  assert.match(verifier, /registeredInstallationHash/);
  assert.match(verifier, /registeredDevicePlatform/);
  assert.match(verifier, /MAX_GPS_ACCURACY_METERS = 100/);
  assert.match(verifier, /MAX_PROPERTY_DISTANCE_METERS = 500/);
  assert.match(verifier, /before-photo evidence does not resolve to an existing production Storage object/);
  assert.match(verifier, /after-photo evidence does not resolve to an existing production Storage object/);
  assert.match(verifier, /completion notes are missing/);
});

test('runtime exports the protected installation registration and lifecycle authority', () => {
  assert.match(runtime, /registerTechnicianDevice,[\s\S]*updateTicketLifecycle,[\s\S]*from "\.\/technicianInstallationBinding"/);
  assert.match(runtime, /resumeTechnicianDuty,[\s\S]*acceptTechnicianTicket,[\s\S]*getTechnicianOperationalReadiness,[\s\S]*from "\.\/secureTechnicianOperations"/);
});

test('Google Play repair candidate increments Android versionCode without changing versionName', () => {
  assert.match(gradle, /versionCode\s+9\b/);
  assert.match(gradle, /versionName\s+"1\.0"/);
  assert.doesNotMatch(gradle, /versionCode\s+8\b/);
});

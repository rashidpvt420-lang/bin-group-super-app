import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Phase 6 trusts only current and previous Play delivery signing identities', async () => {
  const [bridge, verifier] = await Promise.all([
    read('android/app/src/main/java/ae/bingroups/superapp/FirebaseAppCheckBridgePlugin.java'),
    read('scripts/verify-android-play-integrity-appcheck.mjs'),
  ]);

  assert.match(bridge, /CURRENT_PLAY_SIGNING_SHA256/);
  assert.match(bridge, /PREVIOUS_PLAY_SIGNING_SHA256/);
  assert.match(bridge, /isTrustedPlayDeliverySigner/);
  assert.match(bridge, /CURRENT_PLAY_SIGNING_SHA256\.equals\(fingerprint\)/);
  assert.match(bridge, /PREVIOUS_PLAY_SIGNING_SHA256\.equals\(fingerprint\)/);
  assert.match(verifier, /The upload key is deliberately excluded/i);
  assert.doesNotMatch(bridge, /UPLOAD_KEY.*SHA256|UPLOAD_SIGNING_SHA256/);
});

test('Phase 6 Android bridge rejects mock, disabled, stale, zero and poor-accuracy GPS', async () => {
  const bridge = await read('android/app/src/main/java/ae/bingroups/superapp/FirebaseAppCheckBridgePlugin.java');

  assert.match(bridge, /getLocationIntegrityProof/);
  assert.match(bridge, /location\.isMock\(\)/);
  assert.match(bridge, /location\.isFromMockProvider\(\)/);
  assert.match(bridge, /MOCK_LOCATION_DETECTED/);
  assert.match(bridge, /GPS_PROVIDER_DISABLED/);
  assert.match(bridge, /GPS_PERMISSION_REQUIRED/);
  assert.match(bridge, /GPS_LOCATION_STALE/);
  assert.match(bridge, /latitude == 0d && longitude == 0d/);
  assert.match(bridge, /accuracy > 100f/);
  assert.match(bridge, /nativeLocationMocked", false/);
  assert.match(bridge, /locationSource", "native_android_location_manager"/);
});

test('Phase 6 arrival distinguishes physical Android evidence from functional browser execution', async () => {
  const [lifecycle, binding, page] = await Promise.all([
    read('functions/index.ts'),
    read('functions/technicianInstallationBinding.ts'),
    read('src/technician/pages/TechnicianJobDetailPage.tsx'),
  ]);

  assert.match(lifecycle, /\(lat === 0 && lng === 0\)/);
  assert.match(lifecycle, /serverNowMs - capturedAtMs > \(queuedTechnicianId \? 15 \* 60_000 : 60_000\)/);
  assert.match(lifecycle, /arrivalLocation\.nativeLocationMocked !== false/);
  assert.match(lifecycle, /native_android_location_manager/);
  assert.match(lifecycle, /updateData\.gpsVerified = arrivalBinding\.physicalDeviceBound/);
  assert.match(lifecycle, /FUNCTIONAL_ONLY/);
  assert.match(binding, /PLAY_INTEGRITY_INSTALLATION_BOUND/);
  assert.match(binding, /BROWSER_FUNCTIONAL_ONLY/);
  assert.match(page, /getNativeAndroidLocationIntegrityProof/);
  assert.match(page, /nativeLocationMocked: false/);
});

test('Phase 6 live GPS is current, non-zero and installation-bound for physical Android', async () => {
  const [server, client, queue] = await Promise.all([
    read('functions/technicianLiveLocation.ts'),
    read('src/utils/liveTracking.ts'),
    read('src/utils/gpsRetryQueue.ts'),
  ]);

  assert.match(server, /resolveTechnicianArrivalBinding/);
  assert.match(server, /latitude === 0 && longitude === 0/);
  assert.match(server, /request\.data\?\.nativeLocationMocked !== false/);
  assert.match(server, /locationSource !== "native_android_location_manager"/);
  assert.match(server, /serverNowMs - deviceTimestampMs > maxGpsAgeMs/);
  assert.match(server, /PLAY_INTEGRITY_NATIVE_GPS/);
  assert.match(server, /BROWSER_FUNCTIONAL_ONLY/);
  assert.match(client, /getNativeAndroidInstallationHash/);
  assert.match(client, /getNativeAndroidLocationIntegrityProof/);
  assert.match(client, /installationHash: action\.installationHash/);
  assert.match(queue, /installationHash\?: string/);
  assert.match(queue, /nativeLocationMocked\?: false/);
  assert.match(queue, /native_android_location_manager/);
});

test('Phase 6 provides audited MFA-protected Technician device re-registration reset', async () => {
  const [backend, runtime, ui] = await Promise.all([
    read('functions/technicianInstallationBinding.ts'),
    read('functions/runtime.ts'),
    read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx'),
  ]);

  assert.match(backend, /adminResetTechnicianDeviceRegistration = onCall/);
  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /sign_in_second_factor/);
  assert.match(backend, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  assert.match(backend, /registeredInstallationHash: FieldValue\.delete\(\)/);
  assert.match(backend, /registeredDeviceIdHash: FieldValue\.delete\(\)/);
  assert.match(backend, /registeredDeviceId: FieldValue\.delete\(\)/);
  assert.match(backend, /deviceReRegistrationRequired: true/);
  assert.match(backend, /ADMIN_DEVICE_REREGISTRATION/);
  assert.match(backend, /ADMIN_RESET_TECHNICIAN_DEVICE_REGISTRATION/);
  assert.match(backend, /revokeRefreshTokens\(technicianId\)/);
  assert.match(runtime, /adminResetTechnicianDeviceRegistration/);
  assert.match(ui, /adminResetTechnicianDeviceRegistration/);
});

test('Phase 6 before and after photos are immutable Storage-bound server evidence', async () => {
  const [before, after, lifecycle] = await Promise.all([
    read('functions/technicianBeforeWorkEvidence.ts'),
    read('functions/technicianAfterWorkEvidence.ts'),
    read('functions/secureTechnicianOperations.ts'),
  ]);

  for (const source of [before, after]) {
    assert.match(source, /objectGeneration/);
    assert.match(source, /contentHash/);
    assert.match(source, /recordType: "TECHNICIAN_EVIDENCE_CONFIRMATION"/);
    assert.match(source, /object\.getMetadata\(\)/);
    assert.match(source, /enforceAppCheck: true/);
  }
  assert.match(before, /TECHNICIAN_BEFORE_WORK_EVIDENCE_CONFIRMATION/);
  assert.match(before, /technicianBeforeEvidenceState: "CONFIRMED"/);
  assert.match(after, /TECHNICIAN_AFTER_WORK_EVIDENCE_CONFIRMATION/);
  assert.match(after, /technicianAfterEvidenceState: "CONFIRMED"/);
  assert.match(lifecycle, /Before-work evidence changed after verification/);
  assert.match(lifecycle, /After-work evidence changed after verification/);
  assert.match(lifecycle, /evidenceBucket\.file\(beforeStoragePath\)\.getMetadata\(\)/);
});

test('Phase 6 offline arrival retains native integrity and completion remains foreground-only', async () => {
  const [offline, resilience] = await Promise.all([
    read('src/technician/utils/offlineJobActions.ts'),
    read('tests/launch/technician-production-resilience.test.mjs'),
  ]);

  assert.match(offline, /nativeLocationMocked === false/);
  assert.match(offline, /locationSource === 'native_android_location_manager'/);
  assert.match(offline, /!\(lat === 0 && lng === 0\)/);
  assert.doesNotMatch(offline, /\['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'\]/);
  assert.match(resilience, /Completion requires foreground evidence upload/);
});

test('Phase 6 native release is versionCode 13', async () => {
  const gradle = await read('android/app/build.gradle');
  assert.match(gradle, /versionCode\s+13\b/);
});

#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ID = 'bin-group-57c60';
const PROJECT_NUMBER = '123413252227';
const PACKAGE_NAME = 'ae.bingroups.superapp';
// Google Play App Signing SHA-256 for the production BIN GROUP package.
// A certificate fingerprint is public identity metadata, not key material.
const EXPECTED_PLAY_SIGNING_SHA256 = '65:B4:76:9E:05:DE:70:6D:74:BE:CF:89:0F:39:23:95:8C:CB:7A:FB:A0:46:6D:9A:17:34:57:0D:E0:11:C8:91';
const GOOGLE_SERVICES_PATH = path.resolve('android/app/google-services.json');
const OUTPUT_PATH = path.resolve('launch_package/android-play-integrity-appcheck-proof.json');
const repairSha = process.argv.includes('--repair-sha');
const repairConfig = process.argv.includes('--repair-config');

// BIN GROUP distributes this Android package exclusively through Google Play.
// Firebase's recommended App Check posture for that distribution model is:
//   * PLAY_RECOGNIZED required
//   * LICENSED required
//   * no additional explicit device-integrity threshold
// PLAY_RECOGNIZED remains the strong app-integrity gate and Play Integrity can
// still perform its intrinsic device checks. This avoids accidental rejection
// caused by an optional/strong device label that the app never opted into.
const RECOMMENDED_DEVICE_LEVEL = 'NO_INTEGRITY';

const text = (value) => String(value ?? '').trim();
const normalizeSha = (value) => text(value).replace(/[^a-fA-F0-9]/g, '').toUpperCase();
const fail = (message) => {
  console.error(`[android-appcheck] FAIL ${message}`);
  process.exit(1);
};

const accessToken = text(process.env.GCP_ACCESS_TOKEN);
if (process.env.GITHUB_ACTIONS !== 'true') fail('protected GitHub Actions execution is required');
if (!accessToken) fail('GCP_ACCESS_TOKEN is required');

let googleServices;
try {
  googleServices = JSON.parse(readFileSync(GOOGLE_SERVICES_PATH, 'utf8'));
} catch {
  fail('validated android/app/google-services.json is required');
}

const projectInfo = googleServices?.project_info || {};
if (text(projectInfo.project_id) !== PROJECT_ID) fail('Firebase project ID mismatch');
if (text(projectInfo.project_number) !== PROJECT_NUMBER) fail('Firebase project number mismatch');

const androidClient = (googleServices?.client || []).find(
  (client) => text(client?.client_info?.android_client_info?.package_name) === PACKAGE_NAME,
);
if (!androidClient) fail('Firebase Android client for ae.bingroups.superapp is missing');

const appId = text(androidClient?.client_info?.mobilesdk_app_id);
if (!/^1:\d+:android:[a-f0-9]+$/i.test(appId)) fail('Firebase Android app ID is invalid');
if (!appId.startsWith(`1:${PROJECT_NUMBER}:android:`)) fail('Firebase Android app ID project mismatch');

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  return { response, body };
};

const encodedAppId = encodeURIComponent(appId);
const shaUrl = `https://firebase.googleapis.com/v1beta1/projects/-/androidApps/${encodedAppId}/sha`;
const expectedPlaySha = normalizeSha(EXPECTED_PLAY_SIGNING_SHA256);

let shaResult = await request(shaUrl);
if (!shaResult.response.ok) {
  fail(`Firebase Android SHA certificate lookup returned HTTP ${shaResult.response.status}`);
}

const hasExpectedPlaySigningSha = () => (shaResult.body?.certificates || []).some((cert) =>
  text(cert?.certType) === 'SHA_256' && normalizeSha(cert?.shaHash) === expectedPlaySha,
);

let playSigningShaRegistered = hasExpectedPlaySigningSha();
let playSigningShaRepaired = false;

if (!playSigningShaRegistered && repairSha) {
  const createResult = await request(shaUrl, {
    method: 'POST',
    body: JSON.stringify({
      shaHash: EXPECTED_PLAY_SIGNING_SHA256,
      certType: 'SHA_256',
    }),
  });
  if (!createResult.response.ok && createResult.response.status !== 409) {
    fail(`Firebase Play signing SHA-256 registration returned HTTP ${createResult.response.status}`);
  }

  shaResult = await request(shaUrl);
  if (!shaResult.response.ok) {
    fail(`Firebase Android SHA certificate recheck returned HTTP ${shaResult.response.status}`);
  }
  playSigningShaRegistered = hasExpectedPlaySigningSha();
  playSigningShaRepaired = playSigningShaRegistered;
}

if (!playSigningShaRegistered) {
  fail('Google Play App Signing SHA-256 is not registered on the Firebase Android app');
}

const appCheckName = `projects/${PROJECT_NUMBER}/apps/${appId}/playIntegrityConfig`;
const appCheckUrl = `https://firebaseappcheck.googleapis.com/v1/${appCheckName
  .split('/')
  .map((segment) => encodeURIComponent(segment))
  .join('/')}`;

const desiredConfig = {
  name: appCheckName,
  appIntegrity: { allowUnrecognizedVersion: false },
  deviceIntegrity: { minDeviceRecognitionLevel: RECOMMENDED_DEVICE_LEVEL },
  accountDetails: { requireLicensed: true },
};

const writeRecommendedPlayConfig = async () => request(
  `${appCheckUrl}?updateMask=${encodeURIComponent([
    'appIntegrity.allowUnrecognizedVersion',
    'deviceIntegrity.minDeviceRecognitionLevel',
    'accountDetails.requireLicensed',
  ].join(','))}`,
  {
    method: 'PATCH',
    body: JSON.stringify(desiredConfig),
  },
);

const configMatchesRecommendedPlayPolicy = (config) => {
  const allowUnrecognized = config?.appIntegrity?.allowUnrecognizedVersion === true;
  const deviceLevel = text(config?.deviceIntegrity?.minDeviceRecognitionLevel) || RECOMMENDED_DEVICE_LEVEL;
  const requireLicensed = config?.accountDetails?.requireLicensed === true;
  return !allowUnrecognized && deviceLevel === RECOMMENDED_DEVICE_LEVEL && requireLicensed;
};

let appCheckResult = await request(appCheckUrl);
let playIntegrityConfigRepaired = false;

if (appCheckResult.response.status === 404 && repairConfig) {
  const repairResult = await writeRecommendedPlayConfig();
  if (!repairResult.response.ok) {
    fail(`Play Integrity App Check registration repair returned HTTP ${repairResult.response.status}`);
  }
  playIntegrityConfigRepaired = true;
  appCheckResult = await request(appCheckUrl);
}

if (!appCheckResult.response.ok) {
  if (appCheckResult.response.status === 404) {
    fail('Firebase Android app is not registered with the Play Integrity App Check provider');
  }
  fail(`Play Integrity App Check configuration lookup returned HTTP ${appCheckResult.response.status}`);
}

let config = appCheckResult.body || {};
let returnedName = text(config.name);
if (returnedName !== appCheckName) fail('Play Integrity App Check configuration identity mismatch');

if (!configMatchesRecommendedPlayPolicy(config) && repairConfig) {
  const repairResult = await writeRecommendedPlayConfig();
  if (!repairResult.response.ok) {
    fail(`Recommended Google Play App Check policy repair returned HTTP ${repairResult.response.status}`);
  }
  playIntegrityConfigRepaired = true;
  appCheckResult = await request(appCheckUrl);
  if (!appCheckResult.response.ok) {
    fail(`Play Integrity App Check configuration recheck returned HTTP ${appCheckResult.response.status}`);
  }
  config = appCheckResult.body || {};
  returnedName = text(config.name);
  if (returnedName !== appCheckName) fail('Play Integrity App Check configuration identity mismatch after repair');
}

if (!configMatchesRecommendedPlayPolicy(config)) {
  fail('Firebase Play Integrity App Check policy does not match the Google-Play-only production posture');
}

const resolvedDeviceLevel = text(config?.deviceIntegrity?.minDeviceRecognitionLevel) || RECOMMENDED_DEVICE_LEVEL;
const proof = {
  schemaVersion: 2,
  status: 'passed',
  projectId: PROJECT_ID,
  projectNumber: PROJECT_NUMBER,
  packageName: PACKAGE_NAME,
  androidAppIdVerified: true,
  playSigningSha256Registered: true,
  playSigningSha256Repaired: playSigningShaRepaired,
  playIntegrityAppCheckConfigPresent: true,
  playIntegrityAppCheckConfigRepaired: playIntegrityConfigRepaired,
  playIntegrityRequiresPlayRecognizedVersion: true,
  playIntegrityRequiresLicensedAccount: true,
  playIntegrityMinDeviceRecognitionLevel: resolvedDeviceLevel,
  playIntegrityUsesFirebaseRecommendedPlayOnlyPolicy: true,
  playConsoleCloudProjectLink: 'requires-play-installed-runtime-proof',
  observedAt: new Date().toISOString(),
  hardLaunchClaim: false,
};
mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });

console.log('[android-appcheck] PASS Android Firebase registration and Play Integrity App Check configuration verified');
console.log(`[android-appcheck] play_signing_sha_repaired=${playSigningShaRepaired}`);
console.log(`[android-appcheck] play_integrity_config_repaired=${playIntegrityConfigRepaired}`);
console.log('[android-appcheck] play_only_policy=PLAY_RECOGNIZED+LICENSED+NO_EXPLICIT_DEVICE_THRESHOLD');
console.log(`[android-appcheck] wrote ${path.relative(process.cwd(), OUTPUT_PATH)}`);

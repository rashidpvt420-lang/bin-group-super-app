#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXPECTED_PACKAGE = 'ae.bingroups.superapp';
const encoded = String(process.env.ANDROID_GOOGLE_SERVICES_JSON_BASE64 || '').trim();

if (!encoded) {
  console.error('[android-google-services] missing ANDROID_GOOGLE_SERVICES_JSON_BASE64');
  process.exit(1);
}

let decoded;
let config;
try {
  decoded = Buffer.from(encoded, 'base64').toString('utf8');
  config = JSON.parse(decoded);
} catch (error) {
  console.error('[android-google-services] protected Firebase Android config is not valid base64 JSON');
  process.exit(1);
}

if (String(config?.project_info?.project_id || '') !== EXPECTED_PROJECT_ID) {
  console.error('[android-google-services] Firebase project_id does not match the protected BIN GROUP production project');
  process.exit(1);
}

const clients = Array.isArray(config?.client) ? config.client : [];
const androidClient = clients.find(
  (client) => String(client?.client_info?.android_client_info?.package_name || '') === EXPECTED_PACKAGE,
);
if (!androidClient) {
  console.error('[android-google-services] Firebase Android config does not contain ae.bingroups.superapp');
  process.exit(1);
}

const androidAppId = String(androidClient?.client_info?.mobilesdk_app_id || '').trim();
if (!androidAppId) {
  console.error('[android-google-services] Firebase Android app ID is missing for ae.bingroups.superapp');
  process.exit(1);
}
if (!/^1:\d+:android:[a-f0-9]+$/i.test(androidAppId)) {
  console.error('[android-google-services] Firebase Android app ID has an unexpected format');
  process.exit(1);
}

const androidApiKey = String(androidClient?.api_key?.[0]?.current_key || '').trim();
if (!androidApiKey) {
  console.error('[android-google-services] Firebase Android API key is missing for ae.bingroups.superapp');
  process.exit(1);
}
if (/\r|\n/.test(androidApiKey) || /\r|\n/.test(androidAppId)) {
  console.error('[android-google-services] Firebase Android client values must be single-line');
  process.exit(1);
}

const hostedWebApiKey = String(process.env.VITE_FIREBASE_API_KEY || '').trim();
if (hostedWebApiKey && hostedWebApiKey === androidApiKey) {
  console.error('[android-google-services] protected Android API key unexpectedly equals the hosted-web API key');
  process.exit(1);
}

const outputPath = path.join(process.cwd(), 'android', 'app', 'google-services.json');
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${decoded.trim()}\n`, { encoding: 'utf8', mode: 0o600 });
chmodSync(outputPath, 0o600);

// The Capacitor shell serves the bundled web application from https://localhost.
// Firebase Auth therefore must use the Android application's API key, whose
// restrictions are compatible with the signed Android client. The hosted web
// application keeps using VITE_FIREBASE_API_KEY from the production web build.
//
// GitHub Actions propagates values written to GITHUB_ENV to subsequent steps;
// values are never printed here. Keeping the Android Firebase app ID aligned
// with the native client also binds the Web SDK CustomProvider path to the same
// Android app identity that issues the Play Integrity App Check token.
const githubEnv = String(process.env.GITHUB_ENV || '').trim();
if (githubEnv) {
  appendFileSync(
    githubEnv,
    [
      `VITE_FIREBASE_API_KEY=${androidApiKey}`,
      `VITE_FIREBASE_APP_ID=${androidAppId}`,
      'ANDROID_FIREBASE_CLIENT_ENV_EXPORTED=true',
      '',
    ].join('\n'),
    { encoding: 'utf8' },
  );
}

console.log('[android-google-services] validated and injected Firebase Android configuration');
console.log(`[android-google-services] project=${EXPECTED_PROJECT_ID} package=${EXPECTED_PACKAGE}`);
if (githubEnv) {
  console.log('[android-google-services] selected Android Firebase client identity for the Capacitor build');
}

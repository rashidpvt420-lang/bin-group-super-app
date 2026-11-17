#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXPECTED_BUNDLE_ID = 'ae.bingroups.superapp';
const EXPECTED_IOS_APP_ID = '1:123413252227:ios:3a87d36d147cf47899f3b6';
const EXPECTED_PROJECT_NUMBER = '123413252227';
const encoded = String(process.env.IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64 || '').trim();

if (!encoded) {
  console.error('[ios-google-service-info] missing IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64');
  process.exit(1);
}

let decoded;
try {
  decoded = Buffer.from(encoded, 'base64').toString('utf8');
} catch {
  console.error('[ios-google-service-info] protected Firebase iOS config is not valid base64');
  process.exit(1);
}

if (!decoded.includes('<?xml') || !decoded.includes('<plist')) {
  console.error('[ios-google-service-info] protected Firebase iOS config is not a plist document');
  process.exit(1);
}

function readPlistString(xml, key) {
  const pattern = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`);
  const match = xml.match(pattern);
  return match ? String(match[1] || '').trim() : '';
}

const projectId = readPlistString(decoded, 'PROJECT_ID');
const bundleId = readPlistString(decoded, 'BUNDLE_ID');
const iosAppId = readPlistString(decoded, 'GOOGLE_APP_ID');
const senderId = readPlistString(decoded, 'GCM_SENDER_ID');
const iosApiKey = readPlistString(decoded, 'API_KEY');

if (projectId !== EXPECTED_PROJECT_ID) {
  console.error('[ios-google-service-info] Firebase project_id does not match the protected BIN GROUP production project');
  process.exit(1);
}
if (bundleId !== EXPECTED_BUNDLE_ID) {
  console.error('[ios-google-service-info] Firebase iOS BUNDLE_ID does not match ae.bingroups.superapp');
  process.exit(1);
}
if (!iosAppId) {
  console.error('[ios-google-service-info] Firebase iOS app ID is missing for ae.bingroups.superapp');
  process.exit(1);
}
if (!/^1:\d+:ios:[a-f0-9]+$/i.test(iosAppId)) {
  console.error('[ios-google-service-info] Firebase iOS app ID has an unexpected format');
  process.exit(1);
}
if (iosAppId !== EXPECTED_IOS_APP_ID) {
  console.error('[ios-google-service-info] Firebase iOS app ID does not match the production BIN GROUP iOS app');
  process.exit(1);
}
if (senderId && senderId !== EXPECTED_PROJECT_NUMBER) {
  console.error('[ios-google-service-info] Firebase GCM_SENDER_ID does not match the production project number');
  process.exit(1);
}
if (!iosApiKey) {
  console.error('[ios-google-service-info] Firebase iOS API key is missing for ae.bingroups.superapp');
  process.exit(1);
}
if (/\r|\n/.test(iosApiKey) || /\r|\n/.test(iosAppId)) {
  console.error('[ios-google-service-info] Firebase iOS client values must be single-line');
  process.exit(1);
}

const hostedWebApiKey = String(process.env.VITE_FIREBASE_API_KEY || '').trim();
if (hostedWebApiKey && hostedWebApiKey === iosApiKey) {
  console.error('[ios-google-service-info] protected iOS API key unexpectedly equals the hosted-web API key');
  process.exit(1);
}

const outputPath = path.join(process.cwd(), 'ios', 'App', 'App', 'GoogleService-Info.plist');
const envOutputPath = String(process.env.IOS_FIREBASE_CLIENT_ENV_PATH || '').trim()
  || path.join(process.env.RUNNER_TEMP || '/tmp', 'ios-firebase-client.env');

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${decoded.trim()}\n`, { encoding: 'utf8', mode: 0o600 });
chmodSync(outputPath, 0o600);

mkdirSync(path.dirname(envOutputPath), { recursive: true });
writeFileSync(
  envOutputPath,
  [
    `VITE_FIREBASE_API_KEY=${iosApiKey}`,
    `VITE_FIREBASE_APP_ID=${iosAppId}`,
    'IOS_FIREBASE_CLIENT_ENV_EXPORTED=true',
    '',
  ].join('\n'),
  { encoding: 'utf8', mode: 0o600 },
);
chmodSync(envOutputPath, 0o600);

const githubEnv = String(process.env.GITHUB_ENV || '').trim();
if (githubEnv) {
  appendFileSync(
    githubEnv,
    [
      `VITE_FIREBASE_API_KEY=${iosApiKey}`,
      `VITE_FIREBASE_APP_ID=${iosAppId}`,
      'IOS_FIREBASE_CLIENT_ENV_EXPORTED=true',
      '',
    ].join('\n'),
    { encoding: 'utf8' },
  );
}

console.log('[ios-google-service-info] validated and injected Firebase iOS configuration');
console.log(`[ios-google-service-info] project=${EXPECTED_PROJECT_ID} bundle=${EXPECTED_BUNDLE_ID}`);
if (githubEnv) {
  console.log('[ios-google-service-info] selected iOS Firebase client identity for the Capacitor build');
}

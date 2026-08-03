#!/usr/bin/env node
/**
 * Ensure a registered Firebase App Check debug token is present for E2E.
 * Does not print the full token.
 */
import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';

const EXPECTED_PROJECT = 'bin-group-57c60';
const EXPECTED_ADMIN_APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';

const possibleConfigPaths = [
  path.resolve(process.cwd(), '.env.e2e'),
  path.resolve(process.cwd(), 'bin-group-super-app/.env.e2e'),
];

for (const envPath of possibleConfigPaths) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
    console.log('[APPCHECK_ENSURE] loaded=' + envPath);
    break;
  }
}

const PLACEHOLDER_PATTERNS = [
  /^your[_-]?registered[_-]?uuid$/i,
  /^replace[_-]?(me|with)/i,
  /^xxx+$/i,
  /^todo$/i,
  /^changeme$/i,
  /^false$/i,
  /^true$/i,
];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mask(token) {
  if (!token || token.length < 12) return '(invalid)';
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

const token = String(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || '').trim();
const mainAppId = String(process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_WEB_APP_ID || '').trim();
const adminAppId = String(
  process.env.REACT_APP_ADMIN_FIREBASE_APP_ID ||
  process.env.ADMIN_FIREBASE_APP_ID ||
  EXPECTED_ADMIN_APP_ID,
).trim();

console.log(`[APPCHECK_ENSURE] project_expected=${EXPECTED_PROJECT}`);
console.log(`[APPCHECK_ENSURE] main_web_app_id=${mainAppId ? `${mainAppId.slice(0, 12)}…` : '(not set)'}`);
console.log(`[APPCHECK_ENSURE] admin_web_app_id=${`${adminAppId.slice(0, 12)}…${adminAppId.slice(-6)}`}`);

if (adminAppId !== EXPECTED_ADMIN_APP_ID) {
  console.error('[APPCHECK_ENSURE] FAIL Admin Firebase app ID does not match the canonical production web app');
  process.exit(1);
}
if (!token) {
  console.error('[APPCHECK_ENSURE] FAIL missing VITE_FIREBASE_APPCHECK_DEBUG_TOKEN');
  process.exit(1);
}
if (PLACEHOLDER_PATTERNS.some((re) => re.test(token)) || token.includes('YOUR_REGISTERED_UUID')) {
  console.error('[APPCHECK_ENSURE] FAIL placeholder token rejected');
  process.exit(1);
}
if (!UUID_RE.test(token)) {
  console.error('[APPCHECK_ENSURE] FAIL token is not a UUID');
  process.exit(1);
}

console.log(`[APPCHECK_ENSURE] token_fingerprint=${mask(token)}`);
console.log(
  '[APPCHECK_ENSURE] ok — register this UUID for the exact production web app in Firebase Console App Check; the registration must permit both the public and Admin Hosting domains.',
);
process.exit(0);

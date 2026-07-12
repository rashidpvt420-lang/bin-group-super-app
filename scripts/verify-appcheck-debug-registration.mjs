#!/usr/bin/env node
/**
 * Live-check that the App Check debug UUID in .env.e2e is registered in Firebase Console.
 * A 403 on exchangeDebugToken is what profile-gates surface as permission-denied.
 */
import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';

const root = process.cwd();
for (const envPath of [path.join(root, '.env.e2e'), path.join(root, '.env.local')]) {
  if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });
}

const PROJECT_ID = 'bin-group-57c60';
const DEFAULT_APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';
const DEFAULT_API_KEY = 'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s';

const token = String(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || '').trim();
const appId = String(process.env.VITE_FIREBASE_APP_ID || DEFAULT_APP_ID).trim();
const apiKey = String(process.env.VITE_FIREBASE_API_KEY || DEFAULT_API_KEY).trim();

function mask(value) {
  if (!value || value.length < 12) return '(invalid)';
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

if (process.env.APPCHECK_SKIP_REGISTRATION_VERIFY === 'true') {
  console.log('[appcheck-registration] skipped (APPCHECK_SKIP_REGISTRATION_VERIFY=true)');
  process.exit(0);
}

if (!token) {
  console.error('[appcheck-registration] FAIL missing VITE_FIREBASE_APPCHECK_DEBUG_TOKEN');
  process.exit(1);
}

const url =
  `https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}` +
  `/apps/${encodeURIComponent(appId)}:exchangeDebugToken?key=${encodeURIComponent(apiKey)}`;

console.log(`[appcheck-registration] project=${PROJECT_ID} app=${mask(appId)} token=${mask(token)}`);

let response;
try {
  response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Referer': 'https://bin-group-57c60.web.app/'
    },
    body: JSON.stringify({ debugToken: token }),
  });
} catch (err) {
  console.error('[appcheck-registration] FAIL network error:', err.message);
  process.exit(1);
}

const bodyText = await response.text();
let payload = null;
try {
  payload = bodyText ? JSON.parse(bodyText) : null;
} catch {
  payload = { raw: bodyText.slice(0, 400) };
}

if (response.ok && payload?.token) {
  console.log('[appcheck-registration] ok — debug UUID is registered and exchangeable.');
  process.exit(0);
}

if (response.status === 403) {
  console.error('[appcheck-registration] FAIL HTTP 403 exchangeDebugToken rejected.');
  if (payload) console.error('[appcheck-registration] error details=', JSON.stringify(payload));
  console.error('[appcheck-registration] The UUID in .env.e2e is NOT registered (or was rotated without Console update).');
  console.error('[appcheck-registration] Fix: Firebase Console → App Check → BIN GROUP Web → Debug tokens');
  console.error('[appcheck-registration] Add debug token name "Playwright E2E Stable" with fingerprint', mask(token));
  console.error('[appcheck-registration] Do NOT regenerate .env.e2e until the same UUID is saved in Console.');
  process.exit(1);
}

console.error(`[appcheck-registration] FAIL HTTP ${response.status}`);
if (payload) console.error('[appcheck-registration] response=', JSON.stringify(payload).slice(0, 500));
process.exit(1);

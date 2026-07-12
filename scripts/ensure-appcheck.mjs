#!/usr/bin/env node
/**
 * Ensure a registered Firebase App Check debug token is present for E2E.
 * Does not print the full token.
 */
import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';

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
const adminAppId = String(process.env.REACT_APP_FIREBASE_APP_ID || process.env.ADMIN_FIREBASE_APP_ID || '').trim();
const expectedProject = 'bin-group-57c60';

console.log(`[APPCHECK_ENSURE] project_expected=${expectedProject}`);
console.log(`[APPCHECK_ENSURE] main_web_app_id=${mainAppId ? `${mainAppId.slice(0, 12)}…` : '(not set — register token for main web app in Console)'}`);
console.log(`[APPCHECK_ENSURE] admin_web_app_id=${adminAppId ? `${adminAppId.slice(0, 12)}…` : '(not set — register SAME token for admin web app in Console)'}`);

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
console.log('[APPCHECK_ENSURE] ok — ensure this UUID is registered under App Check debug tokens for BOTH the main Firebase Web App and the admin Firebase Web App.');
process.exit(0);

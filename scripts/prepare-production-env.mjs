#!/usr/bin/env node
/**
 * Write .env.production files required for App-Check-enabled hosting builds.
 * Live credentialed E2E against production hosting fails when builds omit
 * VITE_APP_CHECK_SITE_KEY / REACT_APP_APP_CHECK_SITE_KEY while Console enforces App Check.
 */
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

const root = process.cwd();
for (const envPath of [
  path.join(root, '.env.e2e'),
  path.join(root, '.env.local'),
  path.join(root, '.env'),
]) {
  if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });
}

function requireEnv(name, hint = '') {
  const value = String(process.env[name] || '').trim();
  if (!value || /^replace/i.test(value)) {
    console.error(`[prepare-production-env] missing ${name}${hint ? ` — ${hint}` : ''}`);
    process.exit(1);
  }
  return value;
}

const siteKey = requireEnv(
  'VITE_APP_CHECK_SITE_KEY',
  'add your reCAPTCHA v3 site key from Firebase Console → App Check → Apps',
);
const mapsKey = String(process.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const apiKey = String(process.env.VITE_FIREBASE_API_KEY || '').trim();

const mainLines = [
  'VITE_ENABLE_FIREBASE_APPCHECK=true',
  `VITE_APP_CHECK_SITE_KEY=${siteKey}`,
  'VITE_FIREBASE_AUTH_DOMAIN=bin-group-57c60.firebaseapp.com',
  'VITE_FIREBASE_PROJECT_ID=bin-group-57c60',
  'VITE_FIREBASE_STORAGE_BUCKET=bin-group-57c60.firebasestorage.app',
];
if (apiKey) mainLines.push(`VITE_FIREBASE_API_KEY=${apiKey}`);
if (mapsKey) mainLines.push(`VITE_GOOGLE_MAPS_API_KEY=${mapsKey}`);

const adminLines = [
  'REACT_APP_ENABLE_FIREBASE_APPCHECK=true',
  `REACT_APP_APP_CHECK_SITE_KEY=${siteKey}`,
  'REACT_APP_FIREBASE_AUTH_DOMAIN=bin-group-57c60.firebaseapp.com',
  'REACT_APP_FIREBASE_PROJECT_ID=bin-group-57c60',
  'REACT_APP_FIREBASE_STORAGE_BUCKET=bin-group-57c60.firebasestorage.app',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123413252227',
  'REACT_APP_FIREBASE_APP_ID=1:123413252227:web:285cb53bc26626d699f3b6',
];
if (apiKey) adminLines.push(`REACT_APP_FIREBASE_API_KEY=${apiKey}`);
if (mapsKey) adminLines.push(`REACT_APP_GOOGLE_MAPS_API_KEY=${mapsKey}`);

writeFileSync(path.join(root, '.env.production'), `${mainLines.join('\n')}\n`, 'utf8');
writeFileSync(path.join(root, 'apps', 'admin-panel', '.env.production'), `${adminLines.join('\n')}\n`, 'utf8');

console.log('[prepare-production-env] wrote .env.production');
console.log('[prepare-production-env] wrote apps/admin-panel/.env.production');
console.log('[prepare-production-env] App Check site key fingerprint=' + `${siteKey.slice(0, 6)}…${siteKey.slice(-4)}`);

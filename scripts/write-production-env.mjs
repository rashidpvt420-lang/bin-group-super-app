#!/usr/bin/env node

import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const required = [
  'VITE_APP_CHECK_SITE_KEY',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_VAPID_KEY',
];

const failures = [];
for (const key of required) {
  const value = String(process.env[key] || '').trim();
  if (!value || /REPLACE|undefined|null/i.test(value)) failures.push(key);
}

if (failures.length) {
  console.error(`[production-env] missing or malformed values: ${failures.join(', ')}`);
  process.exit(1);
}

const rootLines = [
  ['VITE_GOOGLE_MAPS_API_KEY', process.env.VITE_GOOGLE_MAPS_API_KEY || ''],
  ['VITE_APP_CHECK_SITE_KEY', process.env.VITE_APP_CHECK_SITE_KEY],
  ['VITE_ENABLE_FIREBASE_APPCHECK', 'true'],
  ['VITE_FIREBASE_API_KEY', process.env.VITE_FIREBASE_API_KEY],
  ['VITE_FIREBASE_APP_ID', process.env.VITE_FIREBASE_APP_ID],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID', process.env.VITE_FIREBASE_MESSAGING_SENDER_ID],
  ['VITE_FIREBASE_VAPID_KEY', process.env.VITE_FIREBASE_VAPID_KEY],
];

const adminLines = [
  ['GENERATE_SOURCEMAP', 'false'],
  ['REACT_APP_ENABLE_FIREBASE_APPCHECK', 'true'],
  ['REACT_APP_APP_CHECK_SITE_KEY', process.env.VITE_APP_CHECK_SITE_KEY],
  ['REACT_APP_FIREBASE_API_KEY', process.env.VITE_FIREBASE_API_KEY],
  ['REACT_APP_FIREBASE_APP_ID', process.env.VITE_FIREBASE_APP_ID],
  ['REACT_APP_FIREBASE_MESSAGING_SENDER_ID', process.env.VITE_FIREBASE_MESSAGING_SENDER_ID],
  ['REACT_APP_FIREBASE_AUTH_DOMAIN', 'bin-group-57c60.firebaseapp.com'],
  ['REACT_APP_FIREBASE_PROJECT_ID', 'bin-group-57c60'],
  ['REACT_APP_FIREBASE_STORAGE_BUCKET', 'bin-group-57c60.firebasestorage.app'],
];

function serialize(entries) {
  return `${entries.map(([key, value]) => `${key}=${String(value ?? '')}`).join('\n')}\n`;
}

writeFileSync('.env.production', serialize(rootLines), { mode: 0o600 });
copyFileSync('.env.production', '.env.local');
mkdirSync(path.resolve('apps/admin-panel'), { recursive: true });
writeFileSync('apps/admin-panel/.env.production', serialize(adminLines), { mode: 0o600 });
copyFileSync('apps/admin-panel/.env.production', 'apps/admin-panel/.env.local');
console.log('[production-env] production environment files created');

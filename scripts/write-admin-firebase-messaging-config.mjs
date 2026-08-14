#!/usr/bin/env node
/**
 * CRA copies public files unchanged, so the Firebase Messaging service worker
 * cannot read REACT_APP_* values itself. Generate the public configuration at
 * build time from the same environment used by the Admin bundle.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminRoot = path.join(root, 'apps', 'admin-panel');
const outputPath = path.join(adminRoot, 'public', 'firebase-messaging-config.js');
const sourceFirebasePath = path.join(adminRoot, 'src', 'lib', 'firebase.ts');

function text(value) {
  return String(value || '').trim();
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

function fallbackPublicApiKey() {
  const source = readFileSync(sourceFirebasePath, 'utf8');
  const match = source.match(/REACT_APP_FIREBASE_API_KEY\)\s*\|\|\s*'([^']+)'/);
  if (!match) throw new Error('Admin Firebase source no longer exposes a public API-key fallback.');
  return match[1];
}

const fileEnv = readEnvFile(path.join(adminRoot, '.env.production'));
const apiKey = text(process.env.REACT_APP_FIREBASE_API_KEY)
  || text(process.env.VITE_FIREBASE_API_KEY)
  || text(fileEnv.REACT_APP_FIREBASE_API_KEY)
  || fallbackPublicApiKey();

const config = {
  apiKey,
  authDomain: 'bin-group-57c60.firebaseapp.com',
  projectId: 'bin-group-57c60',
  storageBucket: 'bin-group-57c60.firebasestorage.app',
  messagingSenderId: '123413252227',
  appId: '1:123413252227:web:285cb53bc26626d699f3b6',
};

writeFileSync(
  outputPath,
  `// Generated during the Admin build. Do not commit.\nself.__BIN_GROUP_ADMIN_FIREBASE_CONFIG = ${JSON.stringify(config)};\n`,
  'utf8',
);

console.log('[admin-messaging-config] generated public Firebase Messaging configuration');

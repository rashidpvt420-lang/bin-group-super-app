#!/usr/bin/env node
/**
 * Vite copies public files unchanged, so the Firebase Messaging service worker
 * cannot read import.meta.env directly. Generate the public Firebase client
 * configuration at build time from the same environment used by the root app.
 * Firebase Web App configuration is public client configuration, not a
 * service-account secret.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'public', 'firebase-messaging-config.js');
const sourceFirebasePath = path.join(root, 'src', 'lib', 'firebase.ts');

const text = (value) => String(value || '').trim();

function fallback(name) {
  const source = readFileSync(sourceFirebasePath, 'utf8');
  const patterns = {
    VITE_FIREBASE_API_KEY: /readEnv\('VITE_FIREBASE_API_KEY'\) \|\| '([^']+)'/,
    VITE_FIREBASE_AUTH_DOMAIN: /readEnv\('VITE_FIREBASE_AUTH_DOMAIN'\) \|\| '([^']+)'/,
    VITE_FIREBASE_PROJECT_ID: /readEnv\('VITE_FIREBASE_PROJECT_ID'\) \|\| '([^']+)'/,
    VITE_FIREBASE_STORAGE_BUCKET: /readEnv\('VITE_FIREBASE_STORAGE_BUCKET'\) \|\| '([^']+)'/,
    VITE_FIREBASE_MESSAGING_SENDER_ID: /readEnv\('VITE_FIREBASE_MESSAGING_SENDER_ID'\) \|\| '([^']+)'/,
    VITE_FIREBASE_APP_ID: /readEnv\('VITE_FIREBASE_APP_ID'\) \|\| '([^']+)'/,
  };
  const match = source.match(patterns[name]);
  if (!match) throw new Error(`Root Firebase source no longer exposes a public fallback for ${name}.`);
  return match[1];
}

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const resolved = Object.fromEntries(required.map((name) => [name, text(process.env[name]) || fallback(name)]));

const config = {
  apiKey: resolved.VITE_FIREBASE_API_KEY,
  authDomain: resolved.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: resolved.VITE_FIREBASE_PROJECT_ID,
  storageBucket: resolved.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: resolved.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: resolved.VITE_FIREBASE_APP_ID,
};

writeFileSync(
  outputPath,
  `// Generated during the root build. Do not commit.\nself.__BIN_GROUP_FIREBASE_CONFIG = ${JSON.stringify(config)};\n`,
  'utf8',
);

console.log('[root-messaging-config] generated public Firebase Messaging configuration');

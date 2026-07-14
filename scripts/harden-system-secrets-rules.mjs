#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
const marker = 'match /system_secrets/{secretId}';
const catchAll = '    match /{document=**} {';
const block = `    // Server-managed cryptographic material. Cloud Functions use the Admin SDK;
    // no browser, tenant, owner, technician, broker, or admin client may read it.
    match /system_secrets/{secretId} {
      allow read, write: if false;
    }

`;

if (!existsSync(rulesPath)) {
  console.error(`[harden-system-secrets-rules] Missing ${rulesPath}`);
  process.exit(1);
}

let source = readFileSync(rulesPath, 'utf8');
if (source.includes(marker)) {
  const sectionStart = source.indexOf(marker);
  const section = source.slice(sectionStart, sectionStart + 180);
  if (!section.includes('allow read, write: if false;')) {
    console.error('[harden-system-secrets-rules] Existing system_secrets rule is not fail-closed.');
    process.exit(1);
  }
  console.log('[harden-system-secrets-rules] system_secrets already denied to all clients.');
  process.exit(0);
}

const catchAllIndex = source.indexOf(catchAll);
if (catchAllIndex < 0) {
  console.error('[harden-system-secrets-rules] Catch-all Firestore rule was not found.');
  process.exit(1);
}

source = `${source.slice(0, catchAllIndex)}${block}${source.slice(catchAllIndex)}`;
writeFileSync(rulesPath, source);
console.log('[harden-system-secrets-rules] Added explicit fail-closed system_secrets rule.');

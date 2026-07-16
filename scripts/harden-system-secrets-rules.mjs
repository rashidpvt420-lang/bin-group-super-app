#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
const secretMarker = 'match /system_secrets/{secretId}';
const legacyCatchAll = `    match /{document=**} {
      allow read: if hasAdminClaim();
      allow create: if hasAdminClaim();
      allow update: if hasAdminClaim();
      allow delete: if hasAdminClaim();
    }`;
const secureCatchAll = `    match /{collection}/{document=**} {
      allow read: if !(collection in ['system_secrets', 'users']) && hasAdminClaim();
      allow create: if !(collection in ['system_secrets', 'users']) && hasAdminClaim();
      allow update: if !(collection in ['system_secrets', 'users']) && hasAdminClaim();
      allow delete: if !(collection in ['system_secrets', 'users']) && hasAdminClaim();
    }`;
const secretBlock = `    // Server-managed cryptographic material. Cloud Functions use the Admin SDK;
    // no browser, tenant, owner, technician, broker, or admin client may access it.
    match /system_secrets/{secretId} {
      allow read, write: if false;
    }

`;

if (!existsSync(rulesPath)) {
  console.error(`[harden-system-secrets-rules] Missing ${rulesPath}`);
  process.exit(1);
}

let source = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(secretMarker)) {
  const catchAllIndex = source.indexOf(legacyCatchAll);
  if (catchAllIndex < 0) {
    console.error('[harden-system-secrets-rules] Legacy catch-all was not found before secret-rule insertion.');
    process.exit(1);
  }
  source = `${source.slice(0, catchAllIndex)}${secretBlock}${source.slice(catchAllIndex)}`;
}

if (source.includes(legacyCatchAll)) {
  source = source.replace(legacyCatchAll, secureCatchAll);
}

const secretStart = source.indexOf(secretMarker);
const secretSection = secretStart >= 0 ? source.slice(secretStart, secretStart + 220) : '';
const secretDenied = secretSection.includes('allow read, write: if false;');

const catchAllStart = source.indexOf('match /{collection}/{document=**}');
const catchAllSection = catchAllStart >= 0 ? source.slice(catchAllStart) : '';
const legacyReadExclusion = catchAllSection.includes("collection != 'system_secrets' && hasAdminClaim()");
const explicitReadExclusion = catchAllSection.includes("!(collection in ['system_secrets', 'users']) && hasAdminClaim()");
const writeExclusion = catchAllSection.includes("'system_secrets',") ||
  catchAllSection.includes("collection != 'system_secrets' && hasAdminClaim()") ||
  catchAllSection.includes("!(collection in ['system_secrets', 'users']) && hasAdminClaim()");
const catchAllExcludesSecrets = catchAllStart >= 0 &&
  (legacyReadExclusion || explicitReadExclusion) &&
  writeExclusion;

if (!secretDenied || !catchAllExcludesSecrets || source.includes(legacyCatchAll)) {
  console.error('[harden-system-secrets-rules] system_secrets is not fully excluded from every client allow path.');
  process.exit(1);
}

writeFileSync(rulesPath, source);
console.log('[harden-system-secrets-rules] system_secrets denied and excluded from the admin catch-all.');

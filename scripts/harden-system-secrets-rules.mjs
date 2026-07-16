#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
const secretMarker = 'match /system_secrets/{secretId}';
const secretBlock = `    // Server-managed cryptographic material. Cloud Functions use the Admin SDK;
    // no browser, tenant, owner, technician, broker, or admin client may access it.
    match /system_secrets/{secretId} {
      allow read, write: if false;
    }

`;
const failClosedCatchAll = `    // Collections without an explicit policy are denied. Privileged browser
    // clients must use an explicit collection rule or a server-side callable.
    match /{document=**} {
      allow read, write: if false;
    }`;

function readMatchBlock(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const markerOpen = marker.lastIndexOf('{');
  if (markerOpen < 0) throw new Error(`Match marker has no block-opening brace: ${marker}`);
  const open = start + markerOpen;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: index + 1, text: source.slice(start, index + 1) };
    }
  }
  throw new Error(`Unclosed match block: ${marker}`);
}

if (!existsSync(rulesPath)) {
  console.error(`[harden-system-secrets-rules] Missing ${rulesPath}`);
  process.exit(1);
}

let source = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

const collectionCatchAll = readMatchBlock(source, '    match /{collection}/{document=**} {');
const recursiveCatchAll = readMatchBlock(source, '    match /{document=**} {');

if (!source.includes(secretMarker)) {
  const insertion = collectionCatchAll || recursiveCatchAll;
  if (!insertion) {
    console.error('[harden-system-secrets-rules] No final catch-all was found before secret-rule insertion.');
    process.exit(1);
  }
  source = `${source.slice(0, insertion.start)}${secretBlock}${source.slice(insertion.start)}`;
}

const adminCollectionCatchAll = readMatchBlock(source, '    match /{collection}/{document=**} {');
if (adminCollectionCatchAll) {
  source = `${source.slice(0, adminCollectionCatchAll.start)}${failClosedCatchAll}${source.slice(adminCollectionCatchAll.end)}`;
}

const legacyRecursive = readMatchBlock(source, '    match /{document=**} {');
if (legacyRecursive && !legacyRecursive.text.includes('allow read, write: if false;')) {
  source = `${source.slice(0, legacyRecursive.start)}${failClosedCatchAll}${source.slice(legacyRecursive.end)}`;
}

const secretStart = source.indexOf(secretMarker);
const secretSection = secretStart >= 0 ? source.slice(secretStart, secretStart + 220) : '';
const secretDenied = secretSection.includes('allow read, write: if false;');
const finalFallback = readMatchBlock(source, '    match /{document=**} {');
const fallbackDenied = finalFallback?.text.includes('allow read, write: if false;') === true;
const noAdminCatchAll = !source.includes('match /{collection}/{document=**}');
const fallbackCount = source.split('match /{document=**} {').length - 1;

if (!secretDenied || !fallbackDenied || !noAdminCatchAll || fallbackCount !== 1) {
  console.error('[harden-system-secrets-rules] system_secrets and the final fallback are not fully fail-closed.');
  process.exit(1);
}

writeFileSync(rulesPath, source);
console.log('[harden-system-secrets-rules] system_secrets denied; unspecified collections fail closed.');

#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
const secretMarker = 'match /system_secrets/{secretId}';
const recursiveCatchAllMarker = '    match /{document=**} {';
const collectionCatchAllMarker = '    match /{collection}/{document=**} {';

const secretBlock = `    // Server-managed cryptographic material. Cloud Functions use the Admin SDK;
    // no browser, tenant, owner, technician, broker, or admin client may access it.
    match /system_secrets/{secretId} {
      allow read, write: if false;
    }

`;

const protectedAdminCatchAll = `    match /{collection}/{document=**} {
      allow read: if collection != 'system_secrets' && hasAdminClaim();
      allow create: if collection != 'system_secrets' && hasAdminClaim();
      allow update: if collection != 'system_secrets' && hasAdminClaim();
      allow delete: if collection != 'system_secrets' && hasAdminClaim();
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
      if (depth === 0) {
        return {
          start,
          end: index + 1,
          text: source.slice(start, index + 1),
        };
      }
    }
  }

  throw new Error(`Unclosed match block: ${marker}`);
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

if (!existsSync(rulesPath)) {
  console.error(`[harden-system-secrets-rules] Missing ${rulesPath}`);
  process.exit(1);
}

let source = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

let collectionCatchAll = readMatchBlock(source, collectionCatchAllMarker);
let recursiveCatchAll = readMatchBlock(source, recursiveCatchAllMarker);

if (!source.includes(secretMarker)) {
  const insertion = collectionCatchAll || recursiveCatchAll;
  if (!insertion) {
    console.error('[harden-system-secrets-rules] No final catch-all was found before secret-rule insertion.');
    process.exit(1);
  }

  source = `${source.slice(0, insertion.start)}${secretBlock}${source.slice(insertion.start)}`;
  collectionCatchAll = readMatchBlock(source, collectionCatchAllMarker);
  recursiveCatchAll = readMatchBlock(source, recursiveCatchAllMarker);
}

// Migrate only the legacy unrestricted recursive fallback. Existing list-style
// collection exclusions are stronger and must be preserved byte-for-byte.
if (recursiveCatchAll) {
  source = `${source.slice(0, recursiveCatchAll.start)}${protectedAdminCatchAll}${source.slice(recursiveCatchAll.end)}`;
}

collectionCatchAll = readMatchBlock(source, collectionCatchAllMarker);
recursiveCatchAll = readMatchBlock(source, recursiveCatchAllMarker);

const secretStart = source.indexOf(secretMarker);
const secretSection = secretStart >= 0 ? source.slice(secretStart, secretStart + 240) : '';
const secretDenied = secretSection.includes('allow read, write: if false;');

const fallbackCount = countOccurrences(source, collectionCatchAllMarker);
const noAdminCatchAll = recursiveCatchAll === null;
const catchAllText = collectionCatchAll?.text || '';

const simpleReadExclusion = catchAllText.includes(
  "allow read: if collection != 'system_secrets' && hasAdminClaim();",
);
const listReadExclusion = /allow read: if !\(collection in \[[^\]]*'system_secrets'[^\]]*\]\) && hasAdminClaim\(\);/.test(
  catchAllText,
);
const boundedListReadExclusion = /allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !\(collection in \[[^\]]*'system_secrets'[^\]]*\]\) && hasAdminClaim\(\);/.test(
  catchAllText,
);
const catchAllExcludesSecrets = simpleReadExclusion || listReadExclusion || boundedListReadExclusion;

const simpleCatchAllWriteExcludesSecrets =
  catchAllText.includes("allow create: if collection != 'system_secrets' && hasAdminClaim();") &&
  catchAllText.includes("allow update: if collection != 'system_secrets' && hasAdminClaim();") &&
  catchAllText.includes("allow delete: if collection != 'system_secrets' && hasAdminClaim();");

const boundedTicketPrefix = "collection != 'tickets' && collection != 'maintenanceTickets' && ";
const createRule =
  catchAllText.match(/allow create: if (?:collection != 'tickets' && collection != 'maintenanceTickets' && )?!\([\s\S]*?\) && hasAdminClaim\(\);/)?.[0] || '';
const updateDeleteRule =
  catchAllText.match(/allow update, delete: if (?:collection != 'tickets' && collection != 'maintenanceTickets' && )?!\([\s\S]*?\) && hasAdminClaim\(\);/)?.[0] || '';
const listCatchAllWriteExcludesSecrets =
  createRule.includes("'system_secrets'") && updateDeleteRule.includes("'system_secrets'") &&
  (!createRule.includes("collection != 'tickets'") || createRule.includes(boundedTicketPrefix.trim())) &&
  (!updateDeleteRule.includes("collection != 'tickets'") || updateDeleteRule.includes(boundedTicketPrefix.trim()));

const catchAllWriteExcludesSecrets =
  simpleCatchAllWriteExcludesSecrets || listCatchAllWriteExcludesSecrets;
const fallbackDenied = secretDenied && catchAllExcludesSecrets && catchAllWriteExcludesSecrets;

if (fallbackCount !== 1 || !noAdminCatchAll || !fallbackDenied) {
  console.error('[harden-system-secrets-rules] system_secrets is not fully excluded from every client fallback path.');
  console.error(
    `[harden-system-secrets-rules] fallbackCount=${fallbackCount} noAdminCatchAll=${noAdminCatchAll} fallbackDenied=${fallbackDenied}`,
  );
  process.exit(1);
}

writeFileSync(rulesPath, source, 'utf8');
console.log('[harden-system-secrets-rules] system_secrets denied; stronger unrelated exclusions preserved.');

#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = readFileSync(rulesPath, 'utf8');
const collectionName = 'technician_live_locations';

const explicitBlock = `
    // Canonical live GPS is written only by the App Check-protected Admin SDK callable.
    // Admin browsers may observe active locations but cannot create, update or delete them.
    match /technician_live_locations/{technicianId} {
      allow read: if isAdmin();
      allow create, update, delete: if false;
    }

`;

if (!rules.includes('match /technician_live_locations/{technicianId} {')) {
  const genericMarker = '    match /{collection}/{document=**} {';
  if (!rules.includes(genericMarker)) {
    throw new Error('Generic Firestore fallback marker is missing; refusing to place live-location authority rules.');
  }
  rules = rules.replace(genericMarker, `${explicitBlock}${genericMarker}`);
}

const readNeedle = "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions'])";
const readReplacement = "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'technician_live_locations'])";
if (rules.includes(readNeedle)) rules = rules.replace(readNeedle, readReplacement);
if (!rules.includes(readReplacement)) {
  throw new Error('Canonical live-location collection is not excluded from the generic Admin read fallback.');
}

const protectedCollectionAnchor = "          'system_secrets',\n          'users',";
const protectedCollectionReplacement = "          'system_secrets',\n          'technician_live_locations',\n          'users',";
while (rules.includes(protectedCollectionAnchor)) {
  rules = rules.replace(protectedCollectionAnchor, protectedCollectionReplacement);
}

const protectedOccurrences = rules.match(/'technician_live_locations'/g)?.length || 0;
if (protectedOccurrences < 4) {
  throw new Error(`Expected explicit, read-fallback, create and update protection for ${collectionName}; found ${protectedOccurrences} references.`);
}

const block = rules.slice(
  rules.indexOf('match /technician_live_locations/{technicianId} {'),
  rules.indexOf('match /technician_live_locations/{technicianId} {') + 260,
);
if (!block.includes('allow read: if isAdmin();') || !block.includes('allow create, update, delete: if false;')) {
  throw new Error('Canonical live-location rule block is malformed.');
}

writeFileSync(rulesPath, rules, 'utf8');
console.log('Technician live-location Firestore authority hardened.');

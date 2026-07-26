#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');
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

const readCandidates = [
  "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles'])",
  "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions'])",
];
const readReplacement = "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations'])";
if (!rules.includes(readReplacement)) {
  const candidate = readCandidates.find((value) => rules.includes(value));
  if (!candidate) {
    throw new Error('Generic Admin read fallback is not in a reviewed form; refusing to weaken or guess the rule.');
  }
  rules = rules.replace(candidate, readReplacement);
}

const protectedCollectionAnchor = "          'system_secrets',\n          'users',";
const protectedCollectionReplacement = "          'system_secrets',\n          'technician_live_locations',\n          'users',";
while (rules.includes(protectedCollectionAnchor)) {
  rules = rules.replace(protectedCollectionAnchor, protectedCollectionReplacement);
}

const protectedOccurrences = rules.match(/'technician_live_locations'/g)?.length || 0;
if (protectedOccurrences !== 3) {
  throw new Error(`Expected read-fallback, create and update exclusions for ${collectionName}; found ${protectedOccurrences} quoted references.`);
}

const blockStart = rules.indexOf('match /technician_live_locations/{technicianId} {');
const block = rules.slice(blockStart, blockStart + 260);
if (
  blockStart < 0 ||
  !block.includes('allow read: if isAdmin();') ||
  !block.includes('allow create, update, delete: if false;')
) {
  throw new Error('Canonical live-location rule block is malformed.');
}

writeFileSync(rulesPath, rules, 'utf8');
console.log('Technician live-location Firestore authority hardened.');

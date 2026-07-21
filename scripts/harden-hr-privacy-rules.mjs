#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
const source = readFileSync(rulesPath, 'utf8');

const legacy = `    match /hrProfiles/{profileId} {
      allow read: if isHr() || isFinance() || isOps() || (signedIn() && request.auth.uid == profileId) || staffCanRead(resource.data);
      allow create: if isHr();
      allow update: if isHr();
      allow delete: if isHr();
    }`;

const hardened = `    match /hrProfiles/{profileId} {
      // Private HR records can include Emirates ID, salary package and employment terms.
      // Operations/Finance/user-directory readers must not receive this full document.
      allow read: if isHrManagerTier() || (signedIn() && request.auth.uid == profileId);
      allow create: if isHrManagerTier();
      allow update: if isHrManagerTier();
      allow delete: if isHrManagerTier();
    }`;

if (source.includes(hardened)) {
  console.log('[harden-hr-privacy-rules] already hardened');
  process.exit(0);
}

if (!source.includes(legacy)) {
  console.error('[harden-hr-privacy-rules] expected hrProfiles rule block was not found');
  process.exit(1);
}

writeFileSync(rulesPath, source.replace(legacy, hardened));
console.log('[harden-hr-privacy-rules] hardened hrProfiles private-HR access');

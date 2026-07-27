#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
let source = readFileSync(rulesPath, 'utf8');

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

const legacyMood = `    match /staffMoodCheckins/{checkinId} {
      allow read: if isHr() || staffCanRead(resource.data);
      allow create: if isHr() || staffCanCreate(request.resource.data);
      allow update: if isHr();
      allow delete: if isHr();
    }`;

const hardenedMood = `    match /staffMoodCheckins/{checkinId} {
      // Wellbeing and distress signals are restricted to the employee and HR-manager tier.
      allow read: if isHrManagerTier() || staffCanRead(resource.data);
      allow create: if isHrManagerTier() || staffCanCreate(request.resource.data);
      allow update: if isHrManagerTier();
      allow delete: if isHrManagerTier();
    }`;

const legacyStaffDocuments = `    match /staffDocuments/{documentId} {
      allow read: if isHr() || isFinance() || staffCanRead(resource.data);
      allow create: if isHr() || staffRequestCreate(request.resource.data);
      allow update: if isHr();
      allow delete: if isHr();
    }`;

const hardenedStaffDocuments = `    match /staffDocuments/{documentId} {
      // Passports, IDs, visas and medical files are not a general Finance data source.
      // Finance consumes payroll-safe records from staffPayslips/payroll instead.
      allow read: if isHr() || staffCanRead(resource.data);
      allow create: if isHr() || staffRequestCreate(request.resource.data);
      allow update: if isHr();
      allow delete: if isHr();
    }`;

const transformations = [
  ['hrProfiles', legacy, hardened],
  ['staffMoodCheckins', legacyMood, hardenedMood],
  ['staffDocuments', legacyStaffDocuments, hardenedStaffDocuments],
];

let changed = false;
for (const [label, before, after] of transformations) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) {
    console.error(`[harden-hr-privacy-rules] expected ${label} rule block was not found`);
    process.exit(1);
  }
  source = source.replace(before, after);
  changed = true;
}

if (!changed) {
  console.log('[harden-hr-privacy-rules] HR profile, staff document and wellbeing rules already hardened');
  process.exit(0);
}

writeFileSync(rulesPath, source);
console.log('[harden-hr-privacy-rules] hardened private HR, staff document and wellbeing access');

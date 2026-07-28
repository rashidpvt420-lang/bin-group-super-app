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

const payrollBlock = `    // Canonical payroll is generated in /payroll. This read-only mirror exposes
    // only payroll-safe fields to the matching Technician while all writes remain
    // Admin SDK authority through trigger/backfill functions.
    match /payroll_entries/{entryId} {
      allow read: if isAdmin() || isHr() || isFinance() || (
        signedIn() && resource.data.get('technicianId', null) == request.auth.uid
      );
      allow create, update, delete: if false;
    }

`;
if (!source.includes('match /payroll_entries/{entryId} {')) {
  const marker = '    match /hrProfiles/{profileId} {';
  const index = source.indexOf(marker);
  if (index < 0) throw new Error('HR profile insertion marker is missing.');
  source = `${source.slice(0, index)}${payrollBlock}${source.slice(index)}`;
  changed = true;
}

const readAnchor = "'private_hr_profiles', 'technician_live_locations', 'invoice_registry'";
const readReplacement = "'private_hr_profiles', 'technician_live_locations', 'invoice_registry', 'payroll_entries'";
if (!source.includes(readReplacement)) {
  if (!source.includes(readAnchor)) throw new Error('Reviewed global read exclusion anchor is missing.');
  source = source.replace(readAnchor, readReplacement);
  changed = true;
}

const writeAnchor = "          'transactions',\n          'invoices',";
const writeReplacement = "          'transactions',\n          'payroll_entries',\n          'invoices',";
const writeCount = source.split(writeAnchor).length - 1;
if (!source.includes(writeReplacement)) {
  if (writeCount !== 2) throw new Error(`Expected two payroll write-exclusion anchors, found ${writeCount}.`);
  source = source.replaceAll(writeAnchor, writeReplacement);
  changed = true;
}

const payrollBlockInstalled = source.includes('match /payroll_entries/{entryId} {') &&
  source.includes("resource.data.get('technicianId', null) == request.auth.uid") &&
  source.includes('allow create, update, delete: if false;');
const payrollReadExcludedFromCatchAll = source.includes(readReplacement);
const payrollWriteExclusions = source.split("          'payroll_entries',\n          'invoices',").length - 1;
if (!payrollBlockInstalled || !payrollReadExcludedFromCatchAll || payrollWriteExclusions !== 2) {
  throw new Error(
    `Payroll compatibility authority is incomplete: block=${payrollBlockInstalled} readExclusion=${payrollReadExcludedFromCatchAll} writeExclusions=${payrollWriteExclusions}`,
  );
}

writeFileSync(rulesPath, source);
console.log(changed
  ? '[harden-hr-privacy-rules] hardened HR privacy and Technician payroll self-service authority'
  : '[harden-hr-privacy-rules] HR privacy and payroll self-service rules already hardened');

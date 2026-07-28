#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
let source = readFileSync(rulesPath, 'utf8');

function matchBlockRange(text, header) {
  const start = text.indexOf(header);
  if (start < 0) return null;
  const open = start + header.length - 1;
  if (text[open] !== '{') throw new Error(`Malformed Firestore block header: ${header}`);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: index + 1 };
    }
  }
  throw new Error(`Unclosed Firestore block: ${header}`);
}

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

const payrollHeader = '    match /payroll_entries/{entryId} {';
const payrollRuleBlock = `    match /payroll_entries/{entryId} {
      allow read: if isAdmin() || isHr() || isFinance() || (
        signedIn() && resource.data.get('technicianId', null) == request.auth.uid
      );
      allow create, update, delete: if false;
    }`;
const payrollComment = `    // Canonical payroll is generated in /payroll. This read-only mirror exposes
    // only payroll-safe fields to the matching Technician while all writes remain
    // Admin SDK authority through trigger/backfill functions.\n`;
const existingPayrollRange = matchBlockRange(source, payrollHeader);
if (existingPayrollRange) {
  const current = source.slice(existingPayrollRange.start, existingPayrollRange.end);
  if (current !== payrollRuleBlock) {
    source = `${source.slice(0, existingPayrollRange.start)}${payrollRuleBlock}${source.slice(existingPayrollRange.end)}`;
    changed = true;
  }
} else {
  const marker = '    match /hrProfiles/{profileId} {';
  const index = source.indexOf(marker);
  if (index < 0) throw new Error('HR profile insertion marker is missing.');
  source = `${source.slice(0, index)}${payrollComment}${payrollRuleBlock}\n\n${source.slice(index)}`;
  changed = true;
}

const installedRange = matchBlockRange(source, payrollHeader);
const installedBlock = installedRange ? source.slice(installedRange.start, installedRange.end) : '';
if (installedBlock !== payrollRuleBlock) {
  throw new Error('Payroll compatibility rule was not canonicalized to server-only writes and scoped self-service reads.');
}

writeFileSync(rulesPath, source);
console.log(changed
  ? '[harden-hr-privacy-rules] hardened HR privacy and canonicalized Technician payroll self-service block'
  : '[harden-hr-privacy-rules] HR privacy and Technician payroll self-service block already hardened');

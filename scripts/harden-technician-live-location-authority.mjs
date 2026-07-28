#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');
const collectionName = 'technician_live_locations';

function readFunction(source, name) {
  const marker = `    function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Required Firestore helper is missing: ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: index + 1, text: source.slice(start, index + 1) };
    }
  }
  throw new Error(`Unclosed Firestore helper: ${name}`);
}

function replaceFunction(source, name, replacement) {
  const current = readFunction(source, name);
  if (current.text === replacement) return source;
  return `${source.slice(0, current.start)}${replacement}${source.slice(current.end)}`;
}

function readMatchBlock(source, header) {
  const start = source.indexOf(header);
  if (start < 0) throw new Error(`Required Firestore match block is missing: ${header}`);
  const open = start + header.length - 1;
  if (source[open] !== '{') throw new Error(`Malformed Firestore match block header: ${header}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed Firestore match block: ${header}`);
}

const evidenceOnlyTechnicianUpdate = `    function safeTechnicianTicketUpdate() {
      // Technician browsers may append work evidence and notes only. Arrival and
      // live GPS coordinates are canonical server state written exclusively by
      // App Check-protected callable Functions with assignment, accuracy, expiry
      // and compare-and-set validation.
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'updatedAt',
          'technicianNotes',
          'techNotes',
          'workNotes',
          'notes',
          'afterPhotos',
          'afterPhotoUrl',
          'proofPhotos',
          'completionPhotos',
          'evidencePhotos',
          'evidenceStatus',
          'resolutionSummary',
          'materialsUsed',
          'partsDisposition',
          'proofReadiness'
        ]) &&
        isNotSuspended() &&
        hasApprovedTechnicianRecord() &&
        !(resource.data.get('status', '') in ['COMPLETED', 'completed', 'CLOSED', 'closed', 'TENANT_APPROVED']) &&
        request.resource.data.get('afterPhotos', []).size() >= resource.data.get('afterPhotos', []).size() &&
        request.resource.data.get('afterPhotos', []).hasAll(resource.data.get('afterPhotos', [])) &&
        request.resource.data.get('proofPhotos', []).size() >= resource.data.get('proofPhotos', []).size() &&
        request.resource.data.get('proofPhotos', []).hasAll(resource.data.get('proofPhotos', [])) &&
        request.resource.data.get('completionPhotos', []).size() >= resource.data.get('completionPhotos', []).size() &&
        request.resource.data.get('completionPhotos', []).hasAll(resource.data.get('completionPhotos', [])) &&
        request.resource.data.get('evidencePhotos', []).size() >= resource.data.get('evidencePhotos', []).size() &&
        request.resource.data.get('evidencePhotos', []).hasAll(resource.data.get('evidencePhotos', [])) &&
        (
          resource.data.get('afterPhotoUrl', '') == '' ||
          request.resource.data.get('afterPhotoUrl', '') == resource.data.get('afterPhotoUrl', '')
        );
    }`;

const serverOnlyTechnicianProfileUpdate = `    function safeTechnicianProfileUpdate(techId) {
      // Availability, active-ticket state and all location fields are maintained
      // by protected callable Functions. A browser must never spoof them through
      // technicians/{uid}, even when it owns that document.
      return false;
    }`;

rules = replaceFunction(rules, 'safeTechnicianTicketUpdate', evidenceOnlyTechnicianUpdate);
rules = replaceFunction(rules, 'safeTechnicianProfileUpdate', serverOnlyTechnicianProfileUpdate);

const explicitBlock = `
    // Canonical live GPS is written only by the App Check-protected Admin SDK callable.
    // Suspended-safe dispatch authority may observe active locations but browsers
    // cannot create, update or delete canonical location documents.
    match /technician_live_locations/{technicianId} {
      allow read: if canDispatchJobs();
      allow create, update, delete: if false;
    }

`;

if (!rules.includes('match /technician_live_locations/{technicianId} {')) {
  const genericMarker = '    match /{collection}/{document=**} {';
  if (!rules.includes(genericMarker)) {
    throw new Error('Generic Firestore fallback marker is missing; refusing to place live-location authority rules.');
  }
  rules = rules.replace(genericMarker, `${explicitBlock}${genericMarker}`);
} else {
  rules = rules.replace(
    /match \/technician_live_locations\/\{technicianId\} \{\n\s*allow read: if (?:isAdmin|canDispatchJobs)\(\);\n\s*allow create, update, delete: if false;\n\s*\}/,
    `match /technician_live_locations/{technicianId} {
      allow read: if canDispatchJobs();
      allow create, update, delete: if false;
    }`,
  );
}

const readCandidates = [
  "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry', 'payroll_entries'])",
  "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry'])",
  "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations'])",
  "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles'])",
  "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions'])",
];
const strongestReadReplacement = "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry', 'payroll_entries'])";
if (!rules.includes(strongestReadReplacement)) {
  const candidate = readCandidates.find((value) => rules.includes(value));
  if (!candidate) {
    throw new Error('Generic Admin read fallback is not in a reviewed form; refusing to weaken or guess the rule.');
  }
  rules = rules.replace(candidate, strongestReadReplacement);
}

const protectedCollectionAnchor = "          'system_secrets',\n          'users',";
const protectedCollectionReplacement = "          'system_secrets',\n          'technician_live_locations',\n          'users',";
while (rules.includes(protectedCollectionAnchor)) {
  rules = rules.replace(protectedCollectionAnchor, protectedCollectionReplacement);
}

const payrollWriteAnchor = "          'transactions',\n          'invoices',";
const payrollWriteReplacement = "          'transactions',\n          'payroll_entries',\n          'invoices',";
while (rules.includes(payrollWriteAnchor)) {
  rules = rules.replace(payrollWriteAnchor, payrollWriteReplacement);
}

const protectedOccurrences = rules.match(/'technician_live_locations'/g)?.length || 0;
if (protectedOccurrences !== 3) {
  throw new Error(`Expected read-fallback, create and update exclusions for ${collectionName}; found ${protectedOccurrences} quoted references.`);
}
const payrollReadOccurrences = rules.match(/'payroll_entries'/g)?.length || 0;
if (payrollReadOccurrences !== 3) {
  throw new Error(`Expected read-fallback, create and update exclusions for payroll_entries; found ${payrollReadOccurrences} quoted references.`);
}

const blockStart = rules.indexOf('match /technician_live_locations/{technicianId} {');
const block = rules.slice(blockStart, blockStart + 280);
if (
  blockStart < 0 ||
  !block.includes('allow read: if canDispatchJobs();') ||
  !block.includes('allow create, update, delete: if false;')
) {
  throw new Error('Canonical live-location rule block is malformed.');
}

const payrollBlock = readMatchBlock(rules, '    match /payroll_entries/{entryId} {');
if (
  !payrollBlock.includes("resource.data.get('technicianId', null) == request.auth.uid") ||
  !payrollBlock.includes('allow create, update, delete: if false;') ||
  payrollBlock.includes('allow write: if isAdmin()')
) {
  throw new Error('Canonical payroll compatibility block is not scoped read-only authority.');
}

const technicianTicketHelper = readFunction(rules, 'safeTechnicianTicketUpdate').text;
for (const forbidden of [
  "'arrivedLocation'",
  "'technicianLocation'",
  "'technicianLocationUpdatedAt'",
  "'currentLocation'",
  "'lastLocation'",
  "'isTracking'",
]) {
  if (technicianTicketHelper.includes(forbidden)) {
    throw new Error(`Client-authoritative Technician GPS field remains in ticket rules: ${forbidden}`);
  }
}
if (!readFunction(rules, 'safeTechnicianProfileUpdate').text.includes('return false;')) {
  throw new Error('Technician profile browser writes are not fully disabled.');
}

writeFileSync(rulesPath, rules, 'utf8');
console.log('Technician live-location, profile and payroll catch-all authority hardened to server-only writes.');

#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
let rules = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
const marker = '    match /{collection}/{document=**} {';
const explicit = `
    // Canonical property identity claims are server-only. Cloud Functions use
    // Admin SDK transactions; browsers never read or mutate duplicate claims.
    match /property_identity_registry/{identityHash} {
      allow read, create, update, delete: if false;
    }

`;

if (!rules.includes('match /property_identity_registry/{identityHash} {')) {
  const index = rules.indexOf(marker);
  if (index < 0) throw new Error('[property-identity-registry] generic fallback missing');
  rules = rules.slice(0, index) + explicit + rules.slice(index);
}

const genericStart = rules.indexOf(marker);
if (genericStart < 0) throw new Error('[property-identity-registry] generic fallback missing after insert');
const generic = rules.slice(genericStart);
const readOld = "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry', 'payroll_entries'])";
const readNew = "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry', 'payroll_entries', 'property_identity_registry'])";
let next = generic.includes(readNew) ? generic : generic.replace(readOld, readNew);
if (!next.includes(readNew)) throw new Error('[property-identity-registry] read fallback exclusion could not be hardened');

const writeAnchor = "          'properties',\n          'users',";
const writeReplacement = "          'properties',\n          'property_identity_registry',\n          'users',";
if (!next.includes("'property_identity_registry',\n          'users'")) {
  next = next.replaceAll(writeAnchor, writeReplacement);
}
const identityWriteExclusions = (next.match(/'property_identity_registry',\n\s*'users'/g) || []).length;
if (identityWriteExclusions !== 2) {
  throw new Error(`[property-identity-registry] expected two write fallback exclusions, found ${identityWriteExclusions}`);
}
rules = rules.slice(0, genericStart) + next;

writeFileSync(path, rules, 'utf8');
console.log('[property-identity-registry] server-only identity claims enforced');

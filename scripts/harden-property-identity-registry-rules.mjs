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
let next = generic.includes("'property_identity_registry'") ? generic : generic.replace(readOld, readNew);
const readCondition = next.match(/allow\s+read:\s*if\s*([^;]+);/)?.[1] || '';
if (!readCondition.includes("'property_identity_registry'")) {
  throw new Error('[property-identity-registry] read fallback exclusion could not be hardened');
}
for (const collection of ['owner_portfolio_quotes', 'system_payment_config', 'propertyInspections']) {
  if (generic.includes(`'${collection}'`) && !readCondition.includes(`'${collection}'`)) {
    throw new Error(`[property-identity-registry] stronger read fallback exclusion was lost: ${collection}`);
  }
}

const writeAnchor = "          'properties',\n          'users',";
const writeReplacement = "          'properties',\n          'property_identity_registry',\n          'users',";
const phase10WriteReplacement = "          'properties',\n          'property_identity_registry',\n          'owner_portfolio_quotes',\n          'system_payment_config',\n          'propertyInspections',\n          'users',";
if (!next.includes("'property_identity_registry'")) {
  next = next.replaceAll(writeAnchor, writeReplacement);
}
const writeRules = [...next.matchAll(/allow\s+([^:;]+):\s*([^;]+);/g)]
  .filter(([, operations]) => /\b(create|update|delete|write)\b/.test(operations));
if (
  writeRules.length !== 2 ||
  writeRules.some(([, , condition]) => !condition.includes("'property_identity_registry'"))
) {
  throw new Error('[property-identity-registry] property identity must be excluded from both generic browser write fallbacks');
}
if (next.includes("'owner_portfolio_quotes'") && !next.includes(phase10WriteReplacement.trim())) {
  const phase10Collections = ['owner_portfolio_quotes', 'system_payment_config', 'propertyInspections'];
  if (writeRules.some(([, , condition]) => phase10Collections.some((name) => !condition.includes(`'${name}'`)))) {
    throw new Error('[property-identity-registry] Phase 10 Firebase authority fallback exclusions are incomplete');
  }
}
rules = rules.slice(0, genericStart) + next;

writeFileSync(path, rules, 'utf8');
console.log('[property-identity-registry] server-only identity claims enforced');

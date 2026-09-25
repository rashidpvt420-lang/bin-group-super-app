#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
let source = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

const legacyRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions']) && hasAdminClaim();";
const hardenedRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles']) && hasAdminClaim();";
const liveLocationRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations']) && hasAdminClaim();";
const invoiceRegistryRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry']) && hasAdminClaim();";
const payrollRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry', 'payroll_entries']) && hasAdminClaim();";
const propertyIdentityRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry', 'payroll_entries', 'property_identity_registry']) && hasAdminClaim();";

const legacyWritePrefix = `          'system_secrets',
          'users',
          'audit_logs',
          'admin_security_sessions',`;
const hardenedWritePrefix = `          'system_secrets',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
const liveLocationWritePrefix = `          'system_secrets',
          'technician_live_locations',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
const propertyGeoWritePrefix = `          'system_secrets',
          'technician_live_locations',
          'properties',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
const hrServerAuthorityWritePrefix = `          'system_secrets',
          'technician_live_locations',
          'properties',
          'users',
          'staffRequests',
          'hrAiConversations',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
const propertyIdentityHrServerAuthorityWritePrefix = `          'system_secrets',
          'technician_live_locations',
          'properties',
          'property_identity_registry',
          'users',
          'staffRequests',
          'hrAiConversations',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
const staleHrServerAuthorityWritePrefix = `          'system_secrets',
          'technician_live_locations',
          'properties',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',
          'staffRequests',
          'hrAiConversations',`;
const duplicatedHrServerAuthorityWritePrefix = `          'system_secrets',
          'technician_live_locations',
          'properties',
          'users',
          'staffRequests',
          'hrAiConversations',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',
          'staffRequests',
          'hrAiConversations',`;

const privateBlock = `    // Sensitive employment, Emirates ID and salary data. Admin SDK callables only.
    match /private_hr_profiles/{profileId} {
      allow read, write: if false;
    }

`;

if (source.includes(legacyRead)) source = source.replace(legacyRead, hardenedRead);
const fallbackStart = source.indexOf('    match /{collection}/{document=**} {');
if (fallbackStart < 0) throw new Error('[harden-private-hr-authority] global collection fallback is missing');
let fallback = source.slice(fallbackStart);
const readCondition = fallback.match(/allow\s+read:\s*if\s*([^;]+);/)?.[1] || '';
for (const collection of [
  'private_hr_profiles',
  'admin_security_sessions',
  'technician_live_locations',
  'invoice_registry',
  'payroll_entries',
  'property_identity_registry',
  'owner_portfolio_quotes',
  'system_payment_config',
  'propertyInspections',
]) {
  if (!readCondition.includes(`'${collection}'`)) {
    throw new Error(`[harden-private-hr-authority] global read fallback does not exclude ${collection}`);
  }
}
if (
  !readCondition.includes("collection != 'tickets'") ||
  !readCondition.includes("collection != 'maintenanceTickets'") ||
  !readCondition.includes('hasAdminClaim()')
) {
  throw new Error('[harden-private-hr-authority] global read fallback is not fail-closed');
}

// Preserve historical migration behavior, then verify the resulting authority
// semantically so later stronger hardeners can add more server-only collections.
if (source.includes(duplicatedHrServerAuthorityWritePrefix)) {
  source = source.replaceAll(duplicatedHrServerAuthorityWritePrefix, hrServerAuthorityWritePrefix);
} else if (source.includes(staleHrServerAuthorityWritePrefix)) {
  source = source.replaceAll(staleHrServerAuthorityWritePrefix, hrServerAuthorityWritePrefix);
} else if (source.includes(propertyGeoWritePrefix)) {
  source = source.replaceAll(propertyGeoWritePrefix, hrServerAuthorityWritePrefix);
} else if (source.includes(liveLocationWritePrefix)) {
  source = source.replaceAll(liveLocationWritePrefix, hrServerAuthorityWritePrefix);
} else if (source.includes(legacyWritePrefix)) {
  source = source.replaceAll(legacyWritePrefix, hardenedWritePrefix);
}

fallback = source.slice(source.indexOf('    match /{collection}/{document=**} {'));
const writeConditions = [...fallback.matchAll(/allow\s+([^:;]+):\s*([^;]+);/g)]
  .filter(([, operations]) => /\b(create|update|delete|write)\b/.test(operations));
if (writeConditions.length !== 2) {
  throw new Error(`[harden-private-hr-authority] expected two global write fallbacks, found ${writeConditions.length}`);
}
for (const [, , condition] of writeConditions) {
  for (const collection of [
    'private_hr_profiles',
    'property_identity_registry',
    'owner_portfolio_quotes',
    'system_payment_config',
    'propertyInspections',
  ]) {
    if (!condition.includes(`'${collection}'`)) {
      throw new Error(`[harden-private-hr-authority] global write fallback does not exclude ${collection}`);
    }
  }
  if (!condition.includes('hasAdminClaim()')) {
    throw new Error('[harden-private-hr-authority] global write fallback lost Admin-claim authority');
  }
}

if (!source.includes('match /private_hr_profiles/{profileId}')) {
  const anchor = '    // Firebase Admin SDK only. Browser administrators must use App Check-protected callables.';
  if (!source.includes(anchor)) throw new Error('[harden-private-hr-authority] Admin SDK authority anchor missing');
  source = source.replace(anchor, `${privateBlock}${anchor}`);
}

if (!source.includes("'private_hr_profiles'")) throw new Error('[harden-private-hr-authority] private HR collection is not excluded from global fallbacks');
if (source.split('match /private_hr_profiles/{profileId}').length - 1 !== 1) {
  throw new Error('[harden-private-hr-authority] private HR rule block must exist exactly once');
}

writeFileSync(rulesPath, source, 'utf8');
console.log('[harden-private-hr-authority] private_hr_profiles is Admin-SDK-only and excluded from all browser fallbacks');

#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
let source = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

const legacyRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions']) && hasAdminClaim();";
const hardenedRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles']) && hasAdminClaim();";
const liveLocationRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations']) && hasAdminClaim();";

const legacyWritePrefix = `          'system_secrets',
          'users',
          'audit_logs',
          'admin_security_sessions',`;
const propertyLegacyWritePrefix = `          'system_secrets',
          'properties',
          'users',
          'audit_logs',
          'admin_security_sessions',`;
const hardenedWritePrefix = `          'system_secrets',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
const propertyHardenedWritePrefix = `          'system_secrets',
          'properties',
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
const propertyLiveLocationWritePrefix = `          'system_secrets',
          'technician_live_locations',
          'properties',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;

const privateBlock = `    // Sensitive employment, Emirates ID and salary data. Admin SDK callables only.
    match /private_hr_profiles/{profileId} {
      allow read, write: if false;
    }

`;

if (source.includes(legacyRead)) source = source.replace(legacyRead, hardenedRead);
if (!source.includes(hardenedRead) && !source.includes(liveLocationRead)) {
  throw new Error('[harden-private-hr-authority] global read fallback was not found or could not be hardened');
}

// Preserve stricter property and live-location exclusions installed by other
// authority hardeners. The Private-HR pass may run after the property hardener,
// before the live-location hardener, or against an already canonical ruleset.
let canonicalWritePrefix = hardenedWritePrefix;
if (source.includes(propertyLiveLocationWritePrefix)) {
  canonicalWritePrefix = propertyLiveLocationWritePrefix;
} else if (source.includes(liveLocationWritePrefix)) {
  canonicalWritePrefix = liveLocationWritePrefix;
} else if (source.includes(propertyHardenedWritePrefix)) {
  canonicalWritePrefix = propertyHardenedWritePrefix;
} else if (source.includes(hardenedWritePrefix)) {
  // Already private-HR canonical without property/live-location isolation.
} else if (source.includes(propertyLegacyWritePrefix)) {
  source = source.replaceAll(propertyLegacyWritePrefix, propertyHardenedWritePrefix);
  canonicalWritePrefix = propertyHardenedWritePrefix;
} else if (source.includes(legacyWritePrefix)) {
  source = source.replaceAll(legacyWritePrefix, hardenedWritePrefix);
} else {
  throw new Error('[harden-private-hr-authority] private HR write fallback could not be identified');
}
if (source.split(canonicalWritePrefix).length - 1 !== 2) {
  throw new Error('[harden-private-hr-authority] hardened private HR fallback must exist exactly twice');
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
console.log('[harden-private-hr-authority] private_hr_profiles is Admin-SDK-only and stricter property/live-location exclusions are preserved');

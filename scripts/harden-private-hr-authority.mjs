#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
let source = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

const legacyRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions']) && hasAdminClaim();";
const hardenedRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles']) && hasAdminClaim();";
const liveLocationRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations']) && hasAdminClaim();";
const invoiceRegistryRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry']) && hasAdminClaim();";

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
if (!source.includes(hardenedRead) && !source.includes(liveLocationRead) && !source.includes(invoiceRegistryRead)) {
  throw new Error('[harden-private-hr-authority] global read fallback was not found or could not be hardened');
}

// Preserve a stricter canonical fallback if another authority hardener has also
// excluded server-managed live locations. Never replace it with the shorter
// private-HR-only list.
let canonicalWritePrefix = hardenedWritePrefix;
if (source.includes(duplicatedHrServerAuthorityWritePrefix)) {
  source = source.replaceAll(duplicatedHrServerAuthorityWritePrefix, hrServerAuthorityWritePrefix);
  canonicalWritePrefix = hrServerAuthorityWritePrefix;
} else if (source.includes(staleHrServerAuthorityWritePrefix)) {
  source = source.replaceAll(staleHrServerAuthorityWritePrefix, hrServerAuthorityWritePrefix);
  canonicalWritePrefix = hrServerAuthorityWritePrefix;
} else if (source.includes(hrServerAuthorityWritePrefix)) {
  canonicalWritePrefix = hrServerAuthorityWritePrefix;
} else if (source.includes(propertyGeoWritePrefix)) {
  source = source.replaceAll(propertyGeoWritePrefix, hrServerAuthorityWritePrefix);
  canonicalWritePrefix = hrServerAuthorityWritePrefix;
} else if (source.includes(liveLocationWritePrefix)) {
  source = source.replaceAll(liveLocationWritePrefix, hrServerAuthorityWritePrefix);
  canonicalWritePrefix = hrServerAuthorityWritePrefix;
} else if (source.includes(hardenedWritePrefix)) {
  // Already private-HR canonical.
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
console.log('[harden-private-hr-authority] private_hr_profiles is Admin-SDK-only and excluded from all browser fallbacks');

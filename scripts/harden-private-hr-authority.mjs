#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
let source = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

const legacyRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions']) && hasAdminClaim();";
const hardenedRead = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles']) && hasAdminClaim();";

const legacyWritePrefix = `          'system_secrets',
          'users',
          'audit_logs',
          'admin_security_sessions',`;
const hardenedWritePrefix = `          'system_secrets',
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
if (!source.includes(hardenedRead)) {
  throw new Error('[harden-private-hr-authority] global read fallback was not found or could not be hardened');
}

const legacyWriteCount = source.split(legacyWritePrefix).length - 1;
const hardenedWriteCount = source.split(hardenedWritePrefix).length - 1;
if (legacyWriteCount === 2 && hardenedWriteCount === 0) {
  source = source.replaceAll(legacyWritePrefix, hardenedWritePrefix);
} else if (!(legacyWriteCount === 0 && hardenedWriteCount === 2)) {
  throw new Error(`[harden-private-hr-authority] unexpected private HR fallback count: legacy=${legacyWriteCount}, hardened=${hardenedWriteCount}`);
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

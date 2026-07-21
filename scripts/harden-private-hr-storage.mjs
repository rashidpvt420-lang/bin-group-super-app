#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'storage.rules';
let source = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

const legacyHrRole = "      return isAdmin() || hasAnyRole(['hr_admin', 'hr_manager', 'hr_staff', 'finance_admin', 'finance_staff', 'account_manager']);";
const hardenedHrRole = "      return isAdmin() || hasAnyRole(['hr_admin', 'hr_manager', 'hr_staff']);";

if (source.includes(legacyHrRole)) source = source.replace(legacyHrRole, hardenedHrRole);
if (!source.includes(hardenedHrRole)) {
  throw new Error('[harden-private-hr-storage] HR role helper could not be restricted');
}

const legacyCatchAll = `    match /{allPaths=**} {
      allow read, write: if isAdmin();
    }`;
const hardenedCatchAll = `    // Unknown paths remain Founder/Admin-only, except private HR documents,
    // which are written and read only through Admin SDK callables.
    match /{collection}/{allPaths=**} {
      allow read, write: if isAdmin() && collection != 'privateHrDocuments';
    }`;

if (source.includes(legacyCatchAll)) source = source.replace(legacyCatchAll, hardenedCatchAll);
if (!source.includes(hardenedCatchAll)) {
  throw new Error('[harden-private-hr-storage] global Storage fallback could not be bounded');
}

const privateBlock = `    match /privateHrDocuments/{staffId}/{allPaths=**} {
      allow read, write: if false;
    }

`;
if (!source.includes('match /privateHrDocuments/{staffId}/{allPaths=**}')) {
  const anchor = '    // Unknown paths remain Founder/Admin-only, except private HR documents,';
  if (!source.includes(anchor)) throw new Error('[harden-private-hr-storage] private HR Storage anchor missing');
  source = source.replace(anchor, `${privateBlock}${anchor}`);
}

const helperStart = source.indexOf('    function isHrRole() {');
const helperEnd = source.indexOf('    function isAuditor() {', helperStart);
const helperBlock = source.slice(helperStart, helperEnd);
if (/finance_admin|finance_staff|account_manager/.test(helperBlock)) {
  throw new Error('[harden-private-hr-storage] Finance or Account Management remains in the HR document role helper');
}
if (source.split('match /privateHrDocuments/{staffId}/{allPaths=**}').length - 1 !== 1) {
  throw new Error('[harden-private-hr-storage] private HR Storage block must exist exactly once');
}

writeFileSync(rulesPath, source, 'utf8');
console.log('[harden-private-hr-storage] HR documents exclude Finance/Account roles and privateHrDocuments is Admin-SDK-only');

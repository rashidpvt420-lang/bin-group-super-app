#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
let rules = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
const catchAllMarker = '    match /{collection}/{document=**} {';

const phase10Block = [
  '    // Phase 10: canonical server-issued portfolio quotes are immutable to every',
  '    // browser role. Owners/Admins consume quote results through protected',
  '    // callables so no client can replace amount/hash/expiry authority.',
  '    match /owner_portfolio_quotes/{quoteId} {',
  '      allow read, create, update, delete: if false;',
  '    }',
  '',
  '    // Phase 10: the active payment policy is launch authority. It is read and',
  '    // mutated only by Admin SDK callables/workflows, never by a browser Admin.',
  '    match /system_payment_config/{configId} {',
  '      allow read, create, update, delete: if false;',
  '    }',
  '',
  '    // Phase 10: tenant handover evidence is server-created. The owning property',
  '    // owner may review it, but may change only the explicit review fields.',
  '    match /propertyInspections/{inspectionId} {',
  '      allow read: if isAdmin() || ownerCanRead(resource.data);',
  '      allow create: if false;',
  '      allow update: if ownerCanRead(resource.data) &&',
  '        request.resource.data.diff(resource.data).affectedKeys().hasOnly([',
  "          'ownerReviewStatus',",
  "          'ownerReviewNotes',",
  "          'ownerReviewedAt'",
  '        ]) &&',
  "        request.resource.data.ownerReviewStatus in ['APPROVED', 'DISPUTED'];",
  '      allow delete: if false;',
  '    }',
  '',
].join('\n');

function findMatchBlock(source, header) {
  const start = source.indexOf(header);
  if (start < 0) return '';
  // The match path itself contains a wildcard placeholder such as {quoteId}.
  // Start brace accounting at the final " {" in the full header, not at the
  // placeholder brace inside the path.
  const open = start + header.length - 1;
  if (source[open] !== '{') return '';
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

for (const header of [
  '    match /owner_portfolio_quotes/{quoteId} {',
  '    match /system_payment_config/{configId} {',
  '    match /propertyInspections/{inspectionId} {',
]) {
  const existing = findMatchBlock(rules, header);
  if (existing) rules = rules.replace(existing, '').replace(/\n{3,}/g, '\n\n');
}

const catchIndex = rules.indexOf(catchAllMarker);
if (catchIndex < 0) throw new Error('[phase10-firebase-rules] global collection fallback missing');
rules = rules.slice(0, catchIndex) + phase10Block + rules.slice(catchIndex);

const catchStart = rules.indexOf(catchAllMarker);
let catchAll = rules.slice(catchStart);
const readNeedle = "'invoice_registry', 'payroll_entries', 'property_identity_registry'";
const readReplacement = readNeedle + ", 'owner_portfolio_quotes', 'system_payment_config', 'propertyInspections'";
if (!catchAll.includes(readReplacement)) {
  if (!catchAll.includes(readNeedle)) throw new Error('[phase10-firebase-rules] Admin read fallback exclusion anchor missing');
  catchAll = catchAll.replace(readNeedle, readReplacement);
}

const writeNeedle = "          'property_identity_registry',\n          'users',";
const writeReplacement = "          'property_identity_registry',\n          'owner_portfolio_quotes',\n          'system_payment_config',\n          'propertyInspections',\n          'users',";
if ((catchAll.match(/'owner_portfolio_quotes',\n\s*'system_payment_config',\n\s*'propertyInspections',\n\s*'users'/g) || []).length !== 2) {
  catchAll = catchAll.replaceAll(writeNeedle, writeReplacement);
}
const writeExclusions = (catchAll.match(/'owner_portfolio_quotes',\n\s*'system_payment_config',\n\s*'propertyInspections',\n\s*'users'/g) || []).length;
if (writeExclusions !== 2) {
  throw new Error('[phase10-firebase-rules] expected two Phase 10 Admin write fallback exclusions; found ' + writeExclusions);
}
for (const collection of ['owner_portfolio_quotes', 'system_payment_config', 'propertyInspections']) {
  if (!catchAll.includes("'" + collection + "'")) {
    throw new Error('[phase10-firebase-rules] missing fallback exclusion for ' + collection);
  }
}

rules = rules.slice(0, catchStart) + catchAll;
writeFileSync(path, rules, 'utf8');
console.log('[phase10-firebase-rules] protected quote, payment-config and inspection authority');

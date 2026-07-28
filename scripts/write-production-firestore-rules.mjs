#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const sourcePath = 'firestore.rules';
const outputDirectory = 'launch_generated';
const outputPath = `${outputDirectory}/firestore.rules`;
const manifestPath = `${outputDirectory}/firestore-rules-manifest.json`;
const source = readFileSync(sourcePath, 'utf8').replace(/\r\n?/g, '\n');
const failures = [];

function matchBlock(header) {
  const start = source.indexOf(header);
  if (start < 0) return '';
  const open = start + header.length - 1;
  if (source[open] !== '{') return '';
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return '';
}

const required = [
  'match /technician_live_locations/{technicianId} {',
  'allow create, update, delete: if false;',
  'function safeTechnicianProfileUpdate(techId) {',
  'return false;',
  'match /maintenanceTickets/{ticketId} {',
  'allow create: if isAdmin();',
  'match /tickets/{ticketId} {',
  'match /payroll_entries/{entryId} {',
  "'invoice_registry', 'payroll_entries'",
  "'transactions',\n          'payroll_entries',\n          'invoices'",
];
for (const token of required) {
  if (!source.includes(token)) failures.push(`required hardened rule fragment missing: ${token}`);
}

const technicianUpdateStart = source.indexOf('    function safeTechnicianTicketUpdate() {');
const technicianUpdateEnd = source.indexOf('\n    function ', technicianUpdateStart + 10);
const technicianUpdate = technicianUpdateStart >= 0
  ? source.slice(technicianUpdateStart, technicianUpdateEnd > technicianUpdateStart ? technicianUpdateEnd : source.length)
  : '';
for (const forbidden of [
  "'arrivedLocation'",
  "'technicianLocation'",
  "'technicianLocationUpdatedAt'",
  "'currentLocation'",
  "'lastLocation'",
  "'isTracking'",
]) {
  if (technicianUpdate.includes(forbidden)) failures.push(`client-authoritative GPS field remains: ${forbidden}`);
}

const payrollBlock = matchBlock('    match /payroll_entries/{entryId} {');
if (!payrollBlock) failures.push('payroll_entries rule block is missing or malformed');
else {
  if (
    !payrollBlock.includes("resource.data.get('technicianId', null) == request.auth.uid") &&
    !payrollBlock.includes("isTechnicianId(resource.data.get('technicianId', null))")
  ) {
    failures.push('payroll_entries self-service read is not bound to the matching Technician UID');
  }
  if (!payrollBlock.includes('allow create, update, delete: if false;')) {
    failures.push('payroll_entries browser writes are not fully denied');
  }
  if (payrollBlock.includes('allow write: if isAdmin()')) {
    failures.push('payroll_entries still permits privileged browser writes');
  }
}

const payrollCatchAllOccurrences = source.match(/'payroll_entries'/g)?.length || 0;
if (payrollCatchAllOccurrences !== 3) {
  failures.push(`payroll_entries must be excluded from read, create and update/delete catch-alls; found ${payrollCatchAllOccurrences}`);
}

if (failures.length) {
  console.error('[production-firestore-rules] REFUSED');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

const sha256 = crypto.createHash('sha256').update(source).digest('hex');
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, source, { mode: 0o600 });
writeFileSync(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  sourcePath,
  outputPath,
  sha256,
  generatedAt: new Date().toISOString(),
  callableOnlyTechnicianGps: true,
  canonicalMaintenanceTicketCreation: 'admin-sdk-callable-only',
  legacyTicketsMutation: 'denied',
  payrollMirrorWrites: 'admin-sdk-only',
  payrollMirrorSelfServiceRead: 'technician-uid-scoped',
}, null, 2)}\n`, { mode: 0o600 });
console.log(`[production-firestore-rules] wrote ${outputPath} sha256=${sha256}`);

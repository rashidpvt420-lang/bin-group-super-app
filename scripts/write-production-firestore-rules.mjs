#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const sourcePath = 'firestore.rules';
const outputDirectory = 'launch_generated';
const outputPath = `${outputDirectory}/firestore.rules`;
const manifestPath = `${outputDirectory}/firestore-rules-manifest.json`;
const source = readFileSync(sourcePath, 'utf8').replace(/\r\n?/g, '\n');
const failures = [];

const required = [
  'match /technician_live_locations/{technicianId} {',
  'allow create, update, delete: if false;',
  'function safeTechnicianProfileUpdate(techId) {',
  'return false;',
  'match /maintenanceTickets/{ticketId} {',
  'allow create: if isAdmin();',
  'match /tickets/{ticketId} {',
  'allow create, update, delete: if false;',
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
}, null, 2)}\n`, { mode: 0o600 });
console.log(`[production-firestore-rules] wrote ${outputPath} sha256=${sha256}`);

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('server technician guard validates live Auth and credential expiry', async () => {
  const source = await read('functions/secureTechnicianOperations.ts');
  assert.match(source, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  assert.match(source, /liveUser\.disabled/);
  assert.match(source, /customClaims\?\.suspended === true/);
  assert.match(source, /technicianCredentialMillis/);
  assert.match(source, /medicalCardExpiry/);
  assert.match(source, /drivingLicenseExpiry/);
  assert.match(source, /certifications\.every/);
  assert.match(source, /Technician is not operationally ready/);
  assert.match(source, /medicalState !== "valid" \? "medical card"/);
  assert.match(source, /licenceState !== "valid" \? "driving licence"/);
  assert.match(source, /certificationState !== "valid" \? "required certifications"/);
  assert.match(source, /\{ action, failures: readiness\.failures \}/);
});

test('all technician operational entry points retain the unified server readiness guard', async () => {
  const source = await read('functions/secureTechnicianOperations.ts');
  assert.match(source, /resumeTechnicianDuty = onCall/);
  assert.match(source, /acceptTechnicianTicket = onCall/);
  assert.match(source, /updateTicketLifecycle = onCall/);
  assert.equal((source.match(/runSecured\(/g) || []).length, 4);
  assert.match(source, /assertTechnicianReadiness\(request\.auth, action\)/);
  assert.match(source, /enforceAppCheck: true/);
});

test('runtime routes arrival lifecycle through installation binding while preserving secure readiness authority', async () => {
  const runtime = await read('functions/runtime.ts');
  const binding = await read('functions/technicianInstallationBinding.ts');

  assert.match(runtime, /resumeTechnicianDuty,[\s\S]*acceptTechnicianTicket,[\s\S]*getTechnicianOperationalReadiness,[\s\S]*from "\.\/secureTechnicianOperations"/);
  assert.match(runtime, /registerTechnicianDevice,[\s\S]*updateTicketLifecycle,[\s\S]*from "\.\/technicianInstallationBinding"/);
  assert.match(binding, /updateTicketLifecycle as securedUpdateTicketLifecycle/);
  assert.match(binding, /securedUpdateTicketLifecycle as any/);
  assert.match(binding, /securedHandler\(\{ \.\.\.request, data: incoming \}\)/);
  assert.match(binding, /enforceAppCheck: true/);
});

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
  assert.match(source, /missing, pending, or expired/);
});

test('all technician operational entry points use the server credential guard', async () => {
  const source = await read('functions/secureTechnicianOperations.ts');
  assert.match(source, /resumeTechnicianDuty = onCall/);
  assert.match(source, /acceptTechnicianTicket = onCall/);
  assert.match(source, /updateTicketLifecycle = onCall/);
  assert.equal((source.match(/runSecured\(/g) || []).length, 4);
  assert.match(source, /enforceAppCheck: true/);
});

test('runtime explicitly overrides legacy technician callable exports', async () => {
  const runtime = await read('functions/runtime.ts');
  assert.match(runtime, /resumeTechnicianDuty,[\s\S]*acceptTechnicianTicket,[\s\S]*updateTicketLifecycle,[\s\S]*from "\.\/secureTechnicianOperations"/);
});
